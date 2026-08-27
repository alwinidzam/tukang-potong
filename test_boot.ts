import { db } from './server/db.js';

async function test() {
  db.getData().users = []; // Simulate blank memory
  try {
    await db.ensureFreshData();
    console.log("Success");
  } catch (e) {
    console.error(e.message);
  }
}

test();
