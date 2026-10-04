// Ubah password KoncetCloud dari terminal.
//   node D:/omni-buddy/server/set-password.js            (mode interaktif, input tersembunyi)
//   KC_PASSWORD="..." node D:/omni-buddy/server/set-password.js   (mode non-interaktif)
// Password tidak pernah dicetak kembali ke layar.
import readline from 'node:readline';
import { setPassword, ensureAuth } from './auth.js';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const original = rl._writeToOutput?.bind(rl);
    rl.question(question, (answer) => {
      if (original) rl._writeToOutput = original;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
    // Sembunyikan karakter saat diketik.
    rl._writeToOutput = function (str) {
      if (str.includes(question)) process.stdout.write(str);
    };
  });
}

async function main() {
  const fromEnv = process.env.KC_PASSWORD;

  if (fromEnv) {
    if (fromEnv.length < 8) {
      console.error('Password minimal 8 karakter.');
      process.exit(1);
    }
    setPassword(fromEnv);
    console.log('Password KoncetCloud diperbarui. Sesi lama tidak lagi berlaku.');
    return;
  }

  if (!process.stdin.isTTY) {
    console.error('Tidak ada input interaktif. Pakai: KC_PASSWORD="..." node set-password.js');
    process.exit(1);
  }

  ensureAuth();
  const p1 = await askHidden('Password baru: ');
  if (!p1 || p1.length < 8) {
    console.error('\nPassword minimal 8 karakter.');
    process.exit(1);
  }
  const p2 = await askHidden('Ulangi password: ');
  if (p1 !== p2) {
    console.error('\nPassword tidak sama.');
    process.exit(1);
  }
  setPassword(p1);
  console.log('Password KoncetCloud diperbarui. Sesi lama tidak lagi berlaku.');
}

main().catch((e) => {
  console.error('Gagal mengubah password:', e.message);
  process.exit(1);
});