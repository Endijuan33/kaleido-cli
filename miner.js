// miner.js
import axios from 'axios'
import chalk from 'chalk'
import * as fs from 'fs/promises';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { displayBanner } from './utils/banner.js';

class KaleidoMiningBot {
  constructor(wallet, botIndex) {
    this.wallet = wallet;
    this.botIndex = botIndex;
    this.currentEarnings = { total: 0, pending: 0, paid: 0 };
    this.miningState = {
      isActive: false,
      worker: "quantum-rig-1",
      pool: "quantum-1",
      startTime: null
    };
    this.referralBonus = 0;
    this.stats = {
      hashrate: 75.5,
      shares: { accepted: 0, rejected: 0 },
      efficiency: 1.4,
      powerUsage: 120
    };
    this.sessionFile = `session_${wallet}.json`;

    this.api = axios.create({
      baseURL: 'https://kaleidofinance.xyz/api/testnet',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://kaleidofinance.xyz/testnet',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, seperti Gecko) Chrome/132.0.0.0 Safari/537.36'
      }
    });
  }

  async loadSession() {
    try {
      const data = await fs.readFile(this.sessionFile, 'utf8');
      const session = JSON.parse(data);
      this.miningState.startTime = session.startTime;
      this.currentEarnings = session.earnings;
      this.referralBonus = session.referralBonus;
      console.log(chalk.green(`[Wallet ${this.botIndex}] Previous session loaded successfully`));
      return true;
    } catch (error) {
      return false;
    }
  }

  async saveSession() {
    const sessionData = {
      startTime: this.miningState.startTime,
      earnings: this.currentEarnings,
      referralBonus: this.referralBonus
    };

    try {
      await fs.writeFile(this.sessionFile, JSON.stringify(sessionData, null, 2));
    } catch (error) {
      console.error(chalk.red(`[Wallet ${this.botIndex}] Failed to save session:`), error.message);
    }
  }

  async initialize() {
    try {
      // 1. Check registration status
      const regResponse = await this.retryRequest(
        () => this.api.get(`/check-registration?wallet=${this.wallet}`),
        "Registration check"
      );

      if (!regResponse.data.isRegistered) {
        throw new Error('Wallet not registered');
      }

      // 2. Try to load previous session
      const hasSession = await this.loadSession();

      if (!hasSession) {
        // Hanya inisialisasi nilai baru jika session sebelumnya tidak ada
        this.referralBonus = regResponse.data.userData.referralBonus;
        this.currentEarnings = {
          total: regResponse.data.userData.referralBonus || 0,
          pending: 0,
          paid: 0
        };
        this.miningState.startTime = Date.now();
      }

      // 3. Mulai mining session
      this.miningState.isActive = true;

      console.log(chalk.green(`[Wallet ${this.botIndex}] Mining ${hasSession ? 'resumed' : 'initialized'} successfully`));
      await this.startMiningLoop();

    } catch (error) {
      console.error(chalk.red(`[Wallet ${this.botIndex}] Initialization failed: ${error.message}`));
      console.log(chalk.yellow(`[Wallet ${this.botIndex}] Retrying initialization in 10 seconds...`));
      setTimeout(() => this.initialize(), 10000); // Coba lagi setelah 10 detik
    }
  }

  async retryRequest(requestFn, operationName, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await requestFn();
      } catch (error) {
        const status = error.response ? error.response.status : null;
        // Jika error status 400 atau 401, langsung gagal (bukan error sementara)
        if (status === 400 || status === 401) {
          console.error(chalk.red(`[${operationName}] Request failed with status ${status}: ${error.response?.data?.message || error.message}`));
          throw error;
        }
        // Jika error 429 (Rate limited) atau server error (5xx), gunakan exponential backoff
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        console.log(chalk.yellow(`[${operationName}] Error (status: ${status || 'unknown'}). Retrying (${i + 1}/${retries}) in ${delay/1000} seconds...`));
        // Jika header retry-after ada, gunakan delay tersebut
        if (error.response && error.response.headers && error.response.headers['retry-after']) {
          const retryAfter = parseInt(error.response.headers['retry-after'], 10) * 1000;
          await new Promise(resolve => setTimeout(resolve, retryAfter));
        } else {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    console.error(chalk.red(`[${operationName}] All retries failed.`));
    throw new Error(`${operationName} failed after ${retries} attempts.`);
  }

  calculateEarnings() {
    const timeElapsed = (Date.now() - this.miningState.startTime) / 1000;
    return (this.stats.hashrate * timeElapsed * 0.0001) * (1 + this.referralBonus);
  }

  async updateBalance(finalUpdate = false) {
    try {
      const newEarnings = this.calculateEarnings();
      // Mencegah request jika tidak ada perubahan (threshold bisa disesuaikan)
      if (!finalUpdate && newEarnings < 0.00000001) {
        return;
      }
      const payload = {
        wallet: this.wallet,
        earnings: {
          total: this.currentEarnings.total + newEarnings,
          pending: finalUpdate ? 0 : newEarnings,
          paid: finalUpdate ? this.currentEarnings.paid + newEarnings : this.currentEarnings.paid
        }
      };

      const response = await this.retryRequest(
        () => this.api.post('/update-balance', payload),
        "Balance update"
      );

      if (response.data.success) {
        this.currentEarnings = {
          total: response.data.balance,
          pending: finalUpdate ? 0 : newEarnings,
          paid: finalUpdate ? this.currentEarnings.paid + newEarnings : this.currentEarnings.paid
        };

        await this.saveSession();
        this.logStatus(finalUpdate);
      }
    } catch (error) {
      console.error(chalk.red(`[Wallet ${this.botIndex}] Update failed: ${error.message}`));
    }
  }

  // Fungsi untuk memformat uptime ke format yang lebih readable
  formatUptime(seconds) {
    let sec = Math.floor(seconds);
    const months = Math.floor(sec / (30 * 24 * 3600));
    sec %= (30 * 24 * 3600);
    const weeks = Math.floor(sec / (7 * 24 * 3600));
    sec %= (7 * 24 * 3600);
    const days = Math.floor(sec / (24 * 3600));
    sec %= (24 * 3600);
    const hours = Math.floor(sec / 3600);
    sec %= 3600;
    const minutes = Math.floor(sec / 60);
    const secondsLeft = sec % 60;
    let parts = [];
    if (months > 0) parts.push(`${months}MO`);
    if (weeks > 0) parts.push(`${weeks}W`);
    if (days > 0) parts.push(`${days}D`);
    parts.push(`${hours}H`);
    parts.push(`${minutes}M`);
    parts.push(`${secondsLeft}S`);
    return parts.join(':');
  }

  // Fungsi untuk menyembunyikan wallet
  maskWallet(wallet) {
    return wallet.replace(/.(?=.{3})/g, "*");
  }

  // Detail wallet ditampilkan terpisah (sebelum tabel) dengan warna hijau muda.
  logStatus(final = false) {
    const statusType = final ? "Final Status" : "Mining Status";
    const uptimeSeconds = (Date.now() - this.miningState.startTime) / 1000;
    const formattedUptime = this.formatUptime(uptimeSeconds);
    const maskedWallet = this.maskWallet(this.wallet);

    // Siapkan header dan data untuk tabel
    const headers = ['Uptime', 'Active', 'Hashrate', 'Total', 'Pending', 'Paid', 'Referral Bonus'];
    const data = [
      formattedUptime,
      this.miningState.isActive,
      `${this.stats.hashrate} MH/s`,
      `${this.currentEarnings.total.toFixed(8)} KLDO`,
      `${this.currentEarnings.pending.toFixed(8)} KLDO`,
      `${this.currentEarnings.paid.toFixed(8)} KLDO`,
      `+${(this.referralBonus * 100).toFixed(1)}%`
    ];

    // Fungsi helper untuk membuat tabel horizontal (header + 1 baris data)
    function buildHorizontalTable(headers, data) {
      // Hitung lebar tiap kolom (tanpa formatting warna)
      const colWidths = headers.map((header, i) => {
        return Math.max(header.toString().length, data[i].toString().length) + 2;
      });
      const horizontalLine = '+' + colWidths.map(w => '-'.repeat(w)).join('+') + '+';
      const headerRow = '|' + headers.map((h, i) => ' ' + h.toString().padEnd(colWidths[i] - 1, ' ')).join('|') + '|';

      // Definisikan fungsi pewarnaan untuk tiap kolom
      const colorFunctions = [
        chalk.green,               // Uptime
        chalk.green,               // Active
        chalk.green,               // Hashrate
        chalk.cyan,                // Total
        chalk.yellow,              // Pending
        chalk.hex('#FFA500'),      // Paid (orange)
        text => text               // Referral Bonus (default)
      ];

      const dataRow = '|' + data.map((d, i) =>
        ' ' + colorFunctions[i](d.toString().padEnd(colWidths[i] - 1, ' '))
      ).join('|') + '|';

      return horizontalLine + '\n' + headerRow + '\n' + horizontalLine + '\n' + dataRow + '\n' + horizontalLine;
    }

    const table = buildHorizontalTable(headers, data);

    // Tampilkan log status
    console.log(chalk.yellow(
      `[Wallet ${this.botIndex}] ${statusType} for Wallet: ${chalk.greenBright(maskedWallet)}\n` + table
    ));
  }

  async startMiningLoop() {
    while (this.miningState.isActive) {
      try {
        await this.updateBalance();
      } catch (error) {
        console.error(chalk.red(`[Wallet ${this.botIndex}] API error detected, switching to offline mode.`));
        console.log(chalk.yellow(`[Wallet ${this.botIndex}] Retrying in 60 seconds...`));
        await new Promise(resolve => setTimeout(resolve, 60000)); // Tunggu 60 detik jika terjadi error API
      }
      await new Promise(resolve => setTimeout(resolve, 30000)); // Update setiap 30 detik
    }
  }

  async stop() {
    this.miningState.isActive = false;
    await this.updateBalance(true);
    await this.saveSession();
    return this.currentEarnings.paid;
  }
}

export class MiningCoordinator {
  static instance = null;

  constructor() {
    // Singleton pattern untuk mencegah multiple instance
    if (MiningCoordinator.instance) {
      return MiningCoordinator.instance;
    }
    MiningCoordinator.instance = this;

    this.bots = [];
    this.totalPaid = 0;
    this.isRunning = false;
  }

  async loadWallets() {
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const data = await readFile(join(__dirname, 'wallets.json'), 'utf8');
      return data.split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('0x'));
    } catch (error) {
      console.error('Error loading wallets:', error.message);
      return [];
    }
  }

  async start() {
    // Cegah start berganda
    if (this.isRunning) {
      console.log(chalk.yellow('Mining coordinator is already running'));
      return;
    }

    this.isRunning = true;
    displayBanner();
    const wallets = await this.loadWallets();

    if (wallets.length === 0) {
      console.log(chalk.red('No valid wallets found in wallets.txt'));
      return;
    }

    console.log(chalk.blue(`Loaded ${wallets.length} wallets\n`));

    // Inisialisasi semua bot
    this.bots = wallets.map((wallet, index) => {
      const bot = new KaleidoMiningBot(wallet, index + 1);
      bot.initialize();
      return bot;
    });

    // Tangani shutdown (Ctrl+C)
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\nShutting down miners...'));
      this.totalPaid = (await Promise.all(this.bots.map(bot => bot.stop())))
        .reduce((sum, paid) => sum + paid, 0);

      console.log(chalk.green(`
      === Final Summary ===
      Total Wallets: ${this.bots.length}
      Total Paid: ${this.totalPaid.toFixed(8)} KLDO
      `));
      process.exit();
    });
  }
}
