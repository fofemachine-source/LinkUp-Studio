import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://dcysbrxooqibozgctprn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_F2m6T2Khcw_DlbXwoSzKPA_hCBvBqlB";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false
  }
});

async function main() {
  const email = "silvafrancois13@gmail.com";
  const password = "Franx@2026";
  
  console.log("Signing in...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (authError) {
    console.error("Sign in failed:", authError.message);
    return;
  }
  
  console.log("Sign in successful!");
  
  // Get active tenant
  const uid = authData.user.id;
  const { data: profile } = await supabase.from("profiles").select("active_tenant_id").eq("id", uid).maybeSingle();
  const { data: roles } = await supabase.from("user_roles").select("tenant_id").eq("user_id", uid);
  const tenantId = profile?.active_tenant_id ?? roles?.find((r) => r.tenant_id)?.tenant_id;
  
  if (!tenantId) {
    console.error("Tenant ID not found!");
    return;
  }
  
  console.log(`Syncing active appointments to commandas for tenant: ${tenantId}`);
  
  // Fetch services and products to resolve prices and IDs
  const [{ data: services }, { data: products }, { data: pros }] = await Promise.all([
    supabase.from("services").select("*").eq("tenant_id", tenantId),
    supabase.from("products").select("*").eq("tenant_id", tenantId),
    supabase.from("professionals").select("*").eq("tenant_id", tenantId)
  ]);
  
  const svcList = services ?? [];
  const prodList = products ?? [];
  const proList = pros ?? [];
  
  // Fetch active appointments (not completed, cancelled, no_show)
  const { data: appts, error: apptError } = await supabase
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "confirmed", "in_progress"]);
    
  if (apptError) {
    console.error("Error fetching appointments:", apptError);
    return;
  }
  
  console.log(`Found ${appts.length} active appointments.`);
  
  for (const appt of appts) {
    let cmdId = "";
    if (appt.notes && appt.notes.includes("Comanda ID: ")) {
      cmdId = appt.notes.split("Comanda ID: ")[1].split(" | ")[0].trim();
    }
    
    // Check if comanda exists
    let comandaExists = false;
    if (cmdId) {
      const { data: existingCmd } = await supabase.from("commandas").select("id").eq("id", cmdId).maybeSingle();
      if (existingCmd) {
        comandaExists = true;
      }
    }
    
    if (comandaExists) {
      console.log(`Comanda for appointment ${appt.id} already exists (${cmdId}). Skipping.`);
      continue;
    }
    
    console.log(`Creating open comanda for appointment: ${appt.client_name} - ${appt.start_at}`);
    
    // Resolve services from notes/service_id
    const selectedSvcs: any[] = [];
    const mainSvc = svcList.find(s => s.id === appt.service_id);
    if (mainSvc) {
      selectedSvcs.push(mainSvc);
    }
    
    if (appt.notes && appt.notes.includes("Serviços: ")) {
      const svcPart = appt.notes.split("Serviços: ")[1].split(" | ")[0];
      if (svcPart) {
        const names = svcPart.split(", ").map(s => s.trim().toLowerCase());
        names.forEach(name => {
          const matched = svcList.find(s => s.name?.trim().toLowerCase() === name);
          if (matched && !selectedSvcs.some(x => x.id === matched.id)) {
            selectedSvcs.push(matched);
          }
        });
      }
    }
    
    // Resolve products from notes
    const selectedProds: any[] = [];
    if (appt.notes && appt.notes.includes("Produtos: ")) {
      const prodPart = appt.notes.split("Produtos: ")[1].split(" | ")[0];
      if (prodPart) {
        const names = prodPart.split(", ").map(s => s.trim().toLowerCase());
        names.forEach(name => {
          const matched = prodList.find(p => p.name?.trim().toLowerCase() === name);
          if (matched) {
            selectedProds.push(matched);
          }
        });
      }
    }
    
    const totalSvcValue = selectedSvcs.reduce((acc, s) => acc + Number(s.price || 0), 0);
    const totalProdValue = selectedProds.reduce((acc, p) => acc + Number(p.price || 0), 0);
    const totalValue = totalSvcValue + totalProdValue;
    
    // Insert open comanda
    const { data: countRes } = await supabase.from("commandas").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
    const cmdNumber = (countRes as any)?.count ? (countRes as any).count + 1 : Math.floor(Math.random() * 10000);
    
    const { data: newCmd, error: cmdErr } = await supabase.from("commandas").insert({
      tenant_id: tenantId,
      client_name: appt.client_name || "Cliente",
      number: cmdNumber,
      status: "open",
      subtotal: totalValue,
      total: totalValue
    }).select("id").single();
    
    if (cmdErr || !newCmd) {
      console.error("Error creating comanda:", cmdErr?.message);
      continue;
    }
    
    // Insert comanda items
    const pro = proList.find(p => p.id === appt.professional_id);
    const commission_pct = pro?.commission_pct ?? 0;
    
    for (const svc of selectedSvcs) {
      const commission_value = (Number(svc.price || 0) * commission_pct) / 100;
      await supabase.from("commanda_items").insert({
        commanda_id: newCmd.id,
        tenant_id: tenantId,
        kind: "service",
        ref_id: svc.id,
        name: svc.name,
        quantity: 1,
        unit_price: svc.price,
        professional_id: appt.professional_id || null,
        commission_pct,
        commission_value,
        commission_status: "pending"
      });
    }
    
    for (const prod of selectedProds) {
      await supabase.from("commanda_items").insert({
        commanda_id: newCmd.id,
        tenant_id: tenantId,
        kind: "product",
        ref_id: prod.id,
        name: prod.name,
        quantity: 1,
        unit_price: prod.price,
        professional_id: null,
        commission_pct: 0,
        commission_value: 0,
        commission_status: "pending"
      });
    }
    
    // Update appointment notes to link comanda
    const comandaText = `Comanda ID: ${newCmd.id}`;
    const cleanNotes = appt.notes ? appt.notes.split(" | ").filter(p => !p.startsWith("Comanda ID:")).join(" | ") : "";
    const updatedNotes = [cleanNotes, comandaText].filter(Boolean).join(" | ");
    
    await supabase.from("appointments").update({ notes: updatedNotes }).eq("id", appt.id);
  }
  
  console.log("Migration and sync complete!");
}

main().catch(console.error);
