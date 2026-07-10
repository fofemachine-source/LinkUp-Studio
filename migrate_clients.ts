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
  
  console.log(`Migrating clients for tenant: ${tenantId}`);
  
  // Get all appointments
  const { data: appts, error: apptError } = await supabase
    .from("appointments")
    .select("id, client_name, client_whatsapp, client_id")
    .eq("tenant_id", tenantId);
    
  if (apptError) {
    console.error("Error fetching appointments:", apptError);
    return;
  }
  
  console.log(`Found ${appts.length} appointments.`);
  
  // Get all existing clients to avoid duplication
  const { data: clients, error: clientError } = await supabase
    .from("clients")
    .select("id, full_name, whatsapp")
    .eq("tenant_id", tenantId);
    
  if (clientError) {
    console.error("Error fetching clients:", clientError);
    return;
  }
  
  console.log(`Found ${clients.length} existing clients.`);
  
  for (const appt of appts) {
    if (!appt.client_name || !appt.client_whatsapp) continue;
    
    const cleanWa = appt.client_whatsapp.replace(/\D/g, "");
    if (!cleanWa) continue;
    
    // Check if client exists in clients array
    let client = clients.find(c => c.whatsapp?.replace(/\D/g, "") === cleanWa);
    
    if (!client) {
      console.log(`Creating client: ${appt.client_name} (${cleanWa})`);
      const { data: newClient, error: insertError } = await supabase
        .from("clients")
        .insert({
          tenant_id: tenantId,
          full_name: appt.client_name,
          whatsapp: cleanWa,
          is_subscriber: false
        })
        .select("id, full_name, whatsapp")
        .single();
        
      if (insertError) {
        console.error(`Error inserting client ${appt.client_name}:`, insertError.message);
        continue;
      }
      
      client = newClient;
      clients.push(newClient); // Add to local array to avoid duplicate creation
    }
    
    // Link appointment to client if not already linked
    if (appt.client_id !== client.id) {
      console.log(`Linking appointment ${appt.id} to client ${client.full_name}`);
      await supabase
        .from("appointments")
        .update({ client_id: client.id })
        .eq("id", appt.id);
    }
  }
  
  console.log("Migration complete!");
}

main().catch(console.error);
