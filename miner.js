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
    this.session = null;

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
      const sessionData = JSON.parse(data);
      this.miningState.startTime = sessionData.startTime;
      this.currentEarnings = sessionData.earnings;
      this.referralBonus = sessionData.referralBonus;
      this.session = sessionData.session || Math.floor(Math.random() * 1000000);
      console.log(chalk.green(`[Wallet ${this.botIndex}] Previous session loaded successfully`));
      return true;
    } catch (error) {
      this.session = Math.floor(Math.random() * 1000000);
      return false;
    }
  }

  async saveSession() {
    const sessionData = {
      startTime: this.miningState.startTime,
      earnings: this.currentEarnings,
      referralBonus: this.referralBonus,
      session: this.session
    };

    try {
      await fs.writeFile(this.sessionFile, JSON.stringify(sessionData, null, 2));
    } catch (error) {
      console.error(chalk.red(`[Wallet ${this.botIndex}] Failed to save session:`), error.message);
    }
  }

  async initialize() {
    try {
      const regResponse = await this.retryRequest(
        () => this.api.get(`/check-registration?wallet=${this.wallet}`),
        "Registration check"
      );

      if (!regResponse.data.isRegistered) {
        throw new Error('Wallet not registered');
      }

      const hasSession = await this.loadSession();

      if (!hasSession) {
        this.referralBonus = regResponse.data.userData.referralBonus;
        this.currentEarnings = {
          total: regResponse.data.userData.referralBonus || 0,
          pending: 0,
          paid: 0
        };
        this.miningState.startTime = Date.now();
      }

      this.miningState.isActive = true;

      console.log(chalk.green(`[Wallet ${this.botIndex}] Mining ${hasSession ? 'resumed' : 'initialized'} successfully`));
      await this.startMiningLoop();

    } catch (error) {
      console.error(chalk.red(`[Wallet ${this.botIndex}] Initialization failed: ${error.message}`));
      console.log(chalk.yellow(`[Wallet ${this.botIndex}] Retrying initialization in 10 seconds...`));
      setTimeout(() => this.initialize(), 10000);
    }
  }

  async retryRequest(requestFn, operationName, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await requestFn();
      } catch (error) {
        const status = error.response ? error.response.status : null;
        if (status === 400 || status === 401) {
          console.error(chalk.red(`[${operationName}] Request failed with status ${status}: ${error.response?.data?.message || error.message}`));
          throw error;
        }
        const delay = Math.pow(2, i) * 1000;
        console.log(chalk.yellow(`[${operationName}] Error (status: ${status || 'unknown'}). Retrying (${i + 1}/${retries}) in ${delay / 1000} seconds...`));
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
      if (!finalUpdate && newEarnings < 0.00000001) {
        return;
      }
      const payload = {
        wallet: this.wallet,
        earnings: {
          total: this.currentEarnings.total + newEarnings,
          pending: finalUpdate ? 0 : newEarnings,
          paid: finalUpdate ? this.currentEarnings.paid + newEarnings : this.currentEarnings.paid,
          session: this.session
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

  maskWallet(wallet) {
    return wallet.replace(/.(?=.{3})/g, "*");
  }

  logStatus(final = false) {
    const statusType = final ? "Final Status" : "Mining Status";
    const uptimeSeconds = (Date.now() - this.miningState.startTime) / 1000;
    const formattedUptime = this.formatUptime(uptimeSeconds);
    const maskedWallet = this.maskWallet(this.wallet);

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

    function buildHorizontalTable(headers, data) {
      const colWidths = headers.map((header, i) => {
        return Math.max(header.toString().length, data[i].toString().length) + 2;
      });
      const horizontalLine = '+' + colWidths.map(w => '-'.repeat(w)).join('+') + '+';
      const headerRow = '|' + headers.map((h, i) => ' ' + h.toString().padEnd(colWidths[i] - 1, ' ')).join('|') + '|';

      const colorFunctions = [
        chalk.green,
        chalk.green,
        chalk.green,
        chalk.cyan,
        chalk.yellow,
        chalk.hex('#FFA500'),
        text => text
      ];

      const dataRow = '|' + data.map((d, i) =>
        ' ' + colorFunctions[i](d.toString().padEnd(colWidths[i] - 1, ' '))
      ).join('|') + '|';

      return horizontalLine + '\n' + headerRow + '\n' + horizontalLine + '\n' + dataRow + '\n' + horizontalLine;
    }

    const table = buildHorizontalTable(headers, data);

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
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
      await new Promise(resolve => setTimeout(resolve, 30000));
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

    this.bots = wallets.map((wallet, index) => {
      const bot = new KaleidoMiningBot(wallet, index + 1);
      bot.initialize();
      return bot;
    });

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
