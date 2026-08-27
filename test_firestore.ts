import { loadFromFirestore } from './server/firebase-admin.js';

async function check() {
  const data = await loadFromFirestore();
  const admin = data.users.find(u => u.id === 'usr-admin');
  console.log("Admin password_hash:", admin?.password_hash);
}

check();
