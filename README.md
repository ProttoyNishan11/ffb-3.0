# Family Feud Bangladesh — FFB 3.0

**Dual-mode Host / Participant game:** Local Wi-Fi and Firebase Cloud, using one shared frontend and game interface.

## What is included

- The original two-role home screen: **Admin / Host** and **Participants**.
- **Local Wi-Fi mode:** Node.js + Express + Socket.IO. The Host computer runs the server; participant devices connect to its LAN address.
- **Online Cloud mode:** Firebase Authentication + Firebase Realtime Database. Participants can join from different networks using a room code or invitation link.
- One shared Host interface and one shared Participant display.
- All 10 original question sets (10 questions per set) are prepared on first local startup from ProttoyNishan11/ffb.
- The Host sees every question and answer. Participants receive only the currently published question and the answers individually revealed by the Host.
- Host can reveal a question, reveal/hide each answer, reset the display, and close an online room.
- Host can export the private question bank from Local mode and import it into Firebase Cloud mode.
- Responsive layouts for Host phones/tablets/laptops and Participant phones/tablets/laptops/TV browsers.

## Important architecture note

GitHub Pages is a static host and cannot run the Node.js/Socket.IO local server. **Local Wi-Fi mode must be started on the Host computer with Node.js.** Firebase Cloud mode can be deployed to Firebase Hosting and runs in normal browsers. The same project folder contains both modes. All browser files must remain inside `public/`; both `server.js` and `firebase.json` serve that directory.

## Requirements

- Node.js 22 or newer (Node.js 24 LTS or newer is recommended).
- Internet access on first startup to download the original 10 question pages into a private local file. After the question bank has been downloaded, Local Wi-Fi games can run without internet.
- For Cloud mode: a Firebase project with Realtime Database and Authentication enabled.

## A. Start Local Wi-Fi mode (Windows)

1. Extract the project ZIP to a normal folder, for example `C:\FFB`.
2. Open `.env.example`, copy it as `.env` and change `ADMIN_PASSWORD` and `SESSION_SECRET`. Use a long unique session secret. Keep `.env` private.
3. Open Command Prompt in the project folder and run:

   ```bash
   npm install
   npm start
   ```

   Or double-click `start-windows.bat` (it will create `.env` if missing and install packages on first run).

4. On first startup, the setup script downloads `set1.html` through `set10.html` from the original public FFB repository. It extracts the questions/answers and stores them in `.local/question-bank.json`.
5. The terminal prints the local Host address and one or more Wi-Fi addresses, for example `http://192.168.1.20:3000`.
6. Open `http://localhost:3000` on the Host computer. Select **Admin / Host → Local Wi-Fi** and log in with the Name and Password configured in `.env`.
7. Open the printed LAN address on participant devices and select **Participants → Local Wi-Fi**. Keep all devices on the same Wi-Fi network and leave the Node server running.
8. If Windows Firewall asks, allow Node.js on **Private networks only**. Do not expose the local server port to the public internet.

Default Host name: `Prottoy Nishan`. Set your own Local Host password in `.env`. The example file uses `change-this-password`; change it before hosting a real game.

### Local Wi-Fi behaviour

- All question answers are kept outside `public/` in `.local/`.
- Only an authenticated Local Host can call the private question-bank API or publish game actions.
- Participants connect to a read-only Socket.IO display. Socket.IO broadcasts only the active question and revealed answers; it never broadcasts the complete answer list.
- Local game state is held in server memory and resets if the Node server restarts.

## B. Configure Firebase Cloud mode

### 1. Create the Firebase project

1. Open <https://console.firebase.google.com/> and create a project.
2. Add a **Web App** in Project Settings.
3. Copy the Firebase Web App configuration into `public/js/firebase-config.js`.
4. Create a **Realtime Database** and copy its exact database URL into the `databaseURL` field in `firebase-config.js`.
5. In **Authentication → Sign-in method**, enable:
   - Email/Password (for Host sign-in, as an alternative)
   - Google (for Host sign-in using the Google button on the Cloud Host page)
   - Anonymous (for Participants)
6. For Email/Password sign-in, create the Host account with your email and a strong password. For Google sign-in, use the Google account you want to host with; Firebase creates its user on first sign-in.
7. For Google sign-in, add your Firebase Hosting domain under **Authentication → Settings → Authorized domains**.

Firebase web config values identify the project and are expected to be present in the frontend. They are not database authorization. Security is provided by the Realtime Database rules below.

### 2. Get the Host UID and set database rules

1. Deploy the Hosting app or run Local mode and open `http://localhost:3000/host?mode=cloud`.
2. Sign in using the configured Host account (Email/Password or Google).
3. The dashboard displays **Your Firebase Host UID**.
4. Copy that UID and replace every occurrence of `REPLACE_WITH_HOST_UID` in `firebase/database.rules.json` with the exact UID.
5. Install Firebase CLI if needed, then sign in:

   ```bash
   npm install -g firebase-tools
   firebase login
   ```

6. Copy `.firebaserc.example` to `.firebaserc` and replace `YOUR_FIREBASE_PROJECT_ID` with your actual Firebase project ID (or run `firebase use --add`).
7. Deploy the database rules:

   ```bash
   firebase deploy --only database
   ```

The provided rules deny access by default. Only the configured Host UID can read/write the private question bank, Host state, and room controls. Participants sign in anonymously and can read only room metadata and the public display. Never deploy the placeholder UID rules for a real game; replace the placeholder first.

### 3. Import the private question bank

1. Start Local Wi-Fi mode on your computer at least once so `.local/question-bank.json` is created.
2. Log in to the Local Host dashboard and click **Export question bank for Cloud**. This downloads `ffb-question-bank-private.json`.
3. Open the online Cloud Host page, sign in, and make sure the Host UID has been added to and deployed in the database rules.
4. Use **Import Question Bank** and choose the exported JSON file.
5. After import succeeds, the cloud Host can create an online room.

The import writes the question sets to `/questionBank/{hostUid}/sets`, which is readable only by the configured Host UID under the supplied rules. Do not put the exported bank file into a public GitHub repository.

### 4. Deploy the web app to Firebase Hosting

From the project root:

```bash
firebase deploy --only hosting,database
```

Firebase Hosting will provide a `PROJECT_ID.web.app` address. Open it, choose **Admin / Host → Online Cloud**, and sign in. Create an Online Room. Share the participant link or the room code. Participants select **Participants → Online Cloud** and enter the room code, or open the shared link directly.

See Firebase's official guides:

- <https://firebase.google.com/docs/web/setup>
- <https://firebase.google.com/docs/auth/web/start>
- <https://firebase.google.com/docs/database/web/start>
- <https://firebase.google.com/docs/database/security>
- <https://firebase.google.com/docs/hosting/quickstart>

## C. Run both modes from the same project

- The Local server serves the same frontend and makes Local Wi-Fi mode available.
- If Firebase is configured, the same local server address can also be used to run Cloud mode.
- Firebase Hosting runs the Cloud mode. Local mode is unavailable from Firebase Hosting alone because the Node.js local server is not running there.
- Use the connection mode selected by the Host. Participants must join that same mode.

## D. Question bank and known source corrections

The first-run importer reads the 10 existing `setN.html` question files from `https://github.com/ProttoyNishan11/ffb` and converts them to a private JSON structure. It does not publish the answer bank under `public/`.

Two known content defects from the source repository are corrected during import:

- Set 5, Question 6 had a copied answer instead of its question heading. It is labelled **“প্রশ্ন ৬: মানুষ মোবাইল ফোনে কী কী কাজ করে?”** based on the supplied answers.
- Set 9, Question 5 had its first answer duplicated. The repeated copy is removed.

If the original GitHub question pages are renamed, deleted, or made private before first setup, the downloader will need the correct source repository/branch. You can change `QUESTION_SOURCE_REPO` and `QUESTION_SOURCE_BRANCH` in `.env`.

## E. Important privacy warning about the original repository

The original repository `ProttoyNishan11/ffb` is currently public and contains the original `set1.html`–`set10.html` pages with the answers in their HTML. This new app does not send unrevealed answers to Participant screens, but it cannot make the old public source files secret. For a genuinely confidential game, first create and keep a private backup of the question bank, then make the original repository private or remove the answer-bearing set pages from its public branch. Keep `.local/question-bank.json` and the exported private JSON backup safe; do not upload either to a public repository.

## F. Files that must remain private

Never upload or commit:

- `.env`
- `.local/`
- `node_modules/`
- `ffb-question-bank-private.json` exports
- Firebase service-account private keys (this project does not require one)

The `.gitignore` excludes `.env`, `.local/`, `.firebase/`, and `node_modules/` when using Git normally. If you upload files manually through GitHub's website, check the file list and omit these items yourself.

## G. Verify the project

```bash
npm test
```

This checks required files, the default-deny Firebase rules and the question parser. It does not replace a real two-device Wi-Fi test or a Firebase Cloud test.

## H. Current scope / not included

This release implements the Host-controlled question-and-answer reveal system from the original FFB idea. It does not yet include automatic team scorekeeping, strike indicators, timers, buzzer input, or a participant voting system. Participants answer verbally; the Host controls what is revealed.


## I. GitHub Pages deployment (Online Cloud mode)

This repository includes a GitHub Actions workflow that publishes the contents of `public/` to GitHub Pages. GitHub Pages is static hosting, so **only Online Cloud mode works there**; Local Wi-Fi mode requires the Node.js server on the Host computer.

1. Open **Repository Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Push to `main`. The **Deploy to GitHub Pages** workflow publishes the site automatically.
4. Add `prottoynishan11.github.io` to **Firebase Authentication → Settings → Authorized domains**.
5. Open `https://prottoynishan11.github.io/ffb-3.0/`, choose **Online Cloud**, sign in as Host, and create a room.

The question bank must still be imported into Firebase by the Host. The Host UID in the deployed Realtime Database rules must match the account used to sign in. Participant links are generated using the GitHub Pages project path, so they keep the `/ffb-3.0/` prefix.

