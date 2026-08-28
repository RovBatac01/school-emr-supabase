import { environment, fail } from './env.mjs';

const accounts = [
  { staff_id:'STAFF-0001', full_name:'Dr. Andrea Reyes', username:'admin', email:'admin@demo-school.example', position:'School Clinic Director', role:'SUPER_ADMIN' },
  { staff_id:'STAFF-0002', full_name:'Lina Mercado, RN', username:'clinic.admin', email:'clinic.admin@demo-school.example', position:'Clinic Administrator', role:'CLINIC_ADMIN' },
  { staff_id:'STAFF-0003', full_name:'Maria Santos, RN', username:'nurse.maria', email:'nurse.maria@demo-school.example', position:'School Nurse', role:'CLINIC_STAFF' },
  { staff_id:'STAFF-0004', full_name:'Paolo Navarro', username:'clinic.paolo', email:'clinic.paolo@demo-school.example', position:'Clinic Assistant', role:'CLINIC_STAFF' },
  { staff_id:'STAFF-0005', full_name:'Noel Flores', username:'viewer.noel', email:'viewer.noel@demo-school.example', position:'Guidance Staff', role:'VIEWER' }
];

async function findUserByEmail(client, email) {
  for (let page=1; page<=20; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find(user => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 100) return null;
  }
  return null;
}

async function main() {
  const { client, demoPassword } = environment();
  const { data: roles, error: roleError } = await client.from('roles').select('id,code,name');
  if (roleError) throw roleError;
  const roleMap = new Map(roles.map(role => [role.code, role]));
  console.log('Bootstrapping Supabase Auth development accounts...');
  for (const account of accounts) {
    const role = roleMap.get(account.role);
    if (!role) throw new Error(`Role ${account.role} is missing. Apply Supabase migrations first.`);
    let user = await findUserByEmail(client, account.email);
    if (!user) {
      const { data, error } = await client.auth.admin.createUser({
        email: account.email,
        password: demoPassword,
        email_confirm: true,
        user_metadata: { staff_id: account.staff_id, full_name: account.full_name, username: account.username, position: account.position, must_change_password: false },
        app_metadata: { role_code: account.role }
      });
      if (error || !data.user) throw error || new Error(`Could not create ${account.username}`);
      user = data.user;
      console.log(`  created ${account.username}`);
    } else {
      await client.auth.admin.updateUserById(user.id, { password: demoPassword, email_confirm: true, app_metadata: { ...(user.app_metadata || {}), role_code: account.role } });
      console.log(`  updated ${account.username}`);
    }
    const { error: profileError } = await client.from('profiles').upsert({
      id: user.id,
      staff_id: account.staff_id,
      full_name: account.full_name,
      username: account.username,
      email: account.email,
      position: account.position,
      role_id: role.id,
      status: 'ACTIVE',
      must_change_password: false
    }, { onConflict: 'id' });
    if (profileError) throw profileError;
  }
  console.log(`\nDevelopment accounts are ready. Shared development password: ${demoPassword}`);
  console.log('Change all passwords before entering real student information.');
}

main().catch(error => fail('Account bootstrap failed.', error));
