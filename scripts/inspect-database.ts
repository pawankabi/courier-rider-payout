import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || undefined);

async function main() {
  console.log('Connecting to Firestore database:', config.firestoreDatabaseId);

  // 1. Fetch all riders
  const ridersSnap = await getDocs(collection(db, 'riders'));
  console.log(`\nFound ${ridersSnap.docs.length} riders in /riders:`);
  ridersSnap.docs.forEach((d) => {
    const data = d.data();
    console.log(`- Rider ID: ${d.id}, Name: ${data.name}, Phone: ${data.phone}, TotalAdv: ${data.totalAdvance}, AdvancesCount: ${(data.advances || []).length}`);
    if (data.advances && data.advances.length > 0) {
      data.advances.forEach((a: any) => {
        console.log(`    Adv: id=${a.id}, amt=${a.amount}, reason="${a.reason}", isSettled=${a.isSettled}, status=${a.status}`);
      });
    }
  });

  // 2. Fetch public_statements
  const stmtSnap = await getDocs(collection(db, 'public_statements'));
  console.log(`\nFound ${stmtSnap.docs.length} statements in /public_statements:`);
  stmtSnap.docs.forEach((d) => {
    const data = d.data();
    console.log(`- Stmt ID: ${d.id}, Name: ${data.riderName}, TotalAdv: ${data.totalAdvance}, AdvCount: ${(data.advances || []).length}, SalariesCount: ${(data.salaries || []).length}`);
    if (data.advances && data.advances.length > 0) {
      data.advances.forEach((a: any) => {
        console.log(`    Stmt Adv: id=${a.id}, amt=${a.amount}, isSettled=${a.isSettled}, reason="${a.reason}"`);
      });
    }
    if (data.salaries && data.salaries.length > 0) {
      data.salaries.forEach((s: any) => {
        console.log(`    Stmt Salary: id=${s.id}, range=${s.startDate} to ${s.endDate}, gross=${s.grossTotal}, advDeducted=${s.advanceAmount}, net=${s.netTotal}`);
      });
    }
  });

  // 3. Fetch settlements
  const setSnap = await getDocs(collection(db, 'settlements'));
  console.log(`\nFound ${setSnap.docs.length} settlements in /settlements:`);
  setSnap.docs.forEach((d) => {
    const data = d.data();
    console.log(`- Settlement ID: ${d.id}, RiderId: ${data.riderId}, Range: ${data.startDate} to ${data.endDate}, gross: ${data.grossTotal}, adv: ${data.advanceAmount}, net: ${data.netTotal}, status: ${data.status}`);
  });

  process.exit(0);
}

main().catch((err) => {
  console.error('Error inspect:', err);
  process.exit(1);
});
