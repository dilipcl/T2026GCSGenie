# GCSE Genie 🧞‍♂️
**Master GCSE Organiser, Grade 9 Academic Accelerator & AI Governance System**  
**Tailored for Tejas Dilip (Year 10, Guildford County School)**

---

## 🌟 Key Features

1. **<2-Minute Daily Check-in**:
   - Frictionless habit logging: Energy rating (1–5), Focus level, rapid homework completion toggles, and revision time slider.
   - Earns +10 XP daily check-in + 50 XP per homework task + confetti celebration.

2. **Grade 9 Target Hierarchy & Live RAG Status**:
   - Real-time **Red / Amber / Green** health score for all 6 GCSE subjects:
     - **Edexcel Mathematics** (Linear 9-1)
     - **AQA English Language & Literature**
     - **AQA Separate Science (Triple Award: Biology, Chemistry, Physics)** + 21 Required Practicals
     - **AQA History** (Weimar Germany, Conflict & Tension, Health & People, Normans)
     - **OCR Computer Science** (Comp 1 Systems, Comp 2 Algorithms & Programming + Improvement Log)
     - **AQA Art, Craft & Design** (Component 1 60% Portfolio + 10-hour supervised exam)

3. **Year 9 Real-World Assessment Remediation Portal**:
   - Directly converts diagnostic errors from Tejas's actual Year 9 exam scripts into high-value practice quests (+100 to +300 XP):
     - **Maths**: Venn Diagram independence proofs ($P(A \cap B) = P(A) \times P(B)$), negative fractional scale factors, quadratic sign expansion.
     - **Science**: Chromatography Rf value validation rule ($\text{Rf} < 1.0$), Physics Power-to-Energy minute-to-second safety conversions.
     - **History**: Reparations & Treaty of Versailles keyword definitions, 12-mark comparative essay structure with justified judgment.
     - **Computer Science**: 14-day homework streak challenge for teacher AMN.

4. **Time-Capacity Budget & Burnout Risk Heatmap**:
   - Strictly enforces a **45.0 hrs/week** safe working threshold.
   - Base Commitments tracked: GCS School (32.5h) + Air Cadets (6h Tue/Fri 19:00-22:00) + GCSE Art Support (1.5h) + Drums (2h) + Bronze DofE (2h) = **44.0 hrs/week**.
   - Stress Index calculations and automated MoSCoW prioritization suggestions during mock exam periods.

5. **SMART Goal Consultation Flow**:
   - Student drafts goal (Specific, Measurable, Achievable, Realistic, Time-bound, Weekly hours).
   - Automated stress capacity warning if exceeding 45h limit.
   - Enters `PENDING_DISCUSSION` for parental weekly review and locking.

6. **Parent-Managed Real-World Rewards Ledger & Sanction Logger**:
   - Redeem banked XP for real incentives (1 Hour Weekend Screen Time, Family Takeaway Dinner, Tech accessories).
   - Manual School Sanction / Detention Logger (-500 XP penalty and Rewards Shop freeze until parent-assigned remediation quest is completed).

7. **Model-Agnostic AI Agent Audit Engine**:
   - Runs in-app with **Google Gemini**, **Anthropic Claude**, **OpenAI**, or built-in offline rules.
   - **Google Drive Export**: One-click **"Export Audit Bundle for Claude/Gemini"** generates a JSON + Markdown manifest ready for external Claude 3.5 Sonnet / Gemini Advanced agents.

8. **Tamper-Evident Immutable Audit Ledger**:
   - Every mutation is cryptographically logged with timestamp, user role, field changed, old value, new value, and SHA-256 hash.

---

## 🚀 Running the App

### Option 1: Fast Local Dev Server
```bash
cd "C:\Users\dilip\GCSE-Genie"
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Option 2: Production Build & Preview
```bash
cd "C:\Users\dilip\GCSE-Genie"
npm run build
npm run preview
```

---

## 📱 Mobile Installation Guidelines

### Tejas (iPhone / iOS)
1. Open the app URL in **Safari** on iPhone.
2. Tap the **Share** icon (square with arrow up).
3. Scroll down and tap **"Add to Home Screen"**.
4. The app launches full-screen in standalone mode with native safe-area padding.

### Parents (Android)
1. Open the app URL in **Google Chrome** on Android.
2. Tap the **3 dots** menu in the top right.
3. Tap **"Install app"** or **"Add to Home screen"**.

---

## 🔑 Default Credentials & Settings

- **Parent PIN**: `1234` (Can be changed in Parent Portal settings).
- **Default Google Drive Path**: `G:/My Drive/Documents/UK/Family/Tejas/GCSE-Genie/Backups`
- **Rotational Timetable Start Time**: `08:30` (Fully customizable in Timetable tab).
