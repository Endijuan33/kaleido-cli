## Kaleido Mining Bot
•Kaleido Mining Bot is an automated script for mining KLDO tokens from Kaleido Finance Testnet. It enables multi-wallet mining while following Kaleido's latest security measures to avoid bans and rate limits.

## ⚠️Important Security Guidelines

**To ensure smooth operation and avoid account restrictions, follow these rules when running the bot:**

-**_Account & Device Limits: Max 2 accounts per device, max 5 accounts per IP subnet (Hotspots included). Exceeding these limits may result in temporary or permanent bans._**

-**_VPN/Proxy Restrictions: VPNs and proxies are detected and may lead to account suspension. Always use a real, unmodified network connection._**

-**_Anti-Bot Protection: The bot follows human-like interaction patterns to avoid detection. Avoid making excessive mining requests in a short period._**

-**_Rate Limiting: Mining requests are limited to 5 attempts per hour per account. Exceeding this limit may result in temporary cooldowns or account bans._**

## Register
- https://kaleidofinance.xyz/testnet?ref=9URXAXAJ

## 📌 Key Features
✅ **Session Management**
•Saves each wallet's mining session in a session_{wallet}.json file.
•Resumes previous sessions upon restart.

✅ **Auto-Retry & Error Handling**
•Exponential Backoff: If an API error occurs, the script retries with an increasing delay.
•Status Code Handling: Handles 400, 401 errors (permanent failure) and 429, 5xx errors (retry with delay).

✅ **Mining Status & Earnings Tracking**
•Displays mining statistics

✅ **Referral Bonus System**
•Automatically detects and applies referral bonuses to mining earnings.

✅ **Cross-Platform Compatibility**:
•Works on Windows, macOS, Linux, *Android (run with ubuntu proot/chroot).

## ⚙️ Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Endijuan33/kaleido-cli.git
   cd kaleido-cli
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Edit the wallets.json file using nano/vim, then add your wallet addresses (one per line):
   ```bash
   nano wallets.json
   ```
4. Run Bot
   ```bash
   npm run start
   ```

## 🔄 Updating the Script

**To keep your bot up-to-date with the latest improvements and fixes, simply run the following command in your project directory:**

```bash
   git pull origin main
```
## 🌟Credits  

Special thanks to [**airdropinsiders**](https://github.com/airdropinsiders) for providing the source code for the **miner-cli** on Kaleido Testnet. Your work has been invaluable and is greatly appreciated!


## 📜 License

**This project is available under the [MIT](https://github.com/Endijuan33/kaleido-cli/blob/main/LICENSE) License. Feel free to use and modify it as needed.**
