# 🎙️ Dubber Project

គម្រោងស្ថាបត្យកម្មកម្រិតអាជីព (Professional Architecture) សម្រាប់ប្រព័ន្ធបញ្ចូលសំឡេង **Audio & Video Dubbing Platform** ដោយប្រើប្រាស់បច្ចេកវិទ្យាទំនើប **Node.js, Express.js, Tailwind CSS v4, HTML5, និង JavaScript**។

---

## 📁 រចនាសម្ព័ន្ធ Folder នៃគម្រោង (Directory Structure)

```text
Dubber Project/
├── .git/                      # Git repository
├── .gitignore                 # កំណត់ Ignore ឯកសារដូចជា node_modules, .env
├── .env.example               # គំរូ Environment variables
├── .env                       # Environment variables (PORT=3000, etc.)
├── package.json               # Node.js dependencies & scripts
├── README.md                  # ឯកសារណែនាំការប្រើប្រាស់
│
├── src/                       # Backend Source Code (Express.js)
│   ├── server.js              # Server entry point (app.listen)
│   ├── app.js                 # Express application & middlewares setup
│   ├── config/                # Configurations (Environment variables, etc.)
│   │   └── index.js
│   ├── routes/                # API Endpoints
│   │   └── api.routes.js
│   ├── controllers/           # Business Controllers
│   │   └── dubber.controller.js
│   ├── middlewares/           # Custom Express middlewares (error handling, 404)
│   │   └── errorHandler.js
│   ├── services/              # Core Services (Audio/Video Dubbing Logic)
│   │   └── dubber.service.js
│   └── utils/                 # Utilities & helper functions
│
└── public/                    # Frontend Static Files (Served by Express)
    ├── index.html             # Dashboard & Landing page
    ├── css/
    │   ├── input.css          # Tailwind CSS input file (@import "tailwindcss";)
    │   └── output.css         # Compiled & minified Tailwind CSS
    ├── js/
    │   └── main.js            # Client-side JavaScript
    └── assets/                # Images, audio, icons
        └── images/
```

---

## 🚀 របៀបតម្លើង និងដំណើរការ (Getting Started)

### ១. ដំឡើង Dependencies
```bash
npm install
```

### ២. បង្កើតឯកសារ `.env`
ចម្លងពី `.env.example`:
```bash
copy .env.example .env
```

### ៣. Build Tailwind CSS
ដើម្បីចងក្រង CSS សម្រាប់ Frontend:
```bash
npm run build:css
```
ឬបើចង់ឱ្យ Tailwind ចងក្រង CSS ដោយស្វ័យប្រវត្តិនីមួយៗពេលមានការកែប្រែកូដ (Watch mode):
```bash
npm run watch:css
```

### ៤. ដំណើរការ Server
- **សម្រាប់ Development (ជាមួយ Nodemon - auto restart):**
  ```bash
  npm run dev
  ```
- **សម្រាប់ Production:**
  ```bash
  npm start
  ```

ចូលទៅកាន់ Browser:
👉 **Web App & Dashboard:** [http://localhost:3000](http://localhost:3000)  
👉 **API Health Check:** [http://localhost:3000/api/health](http://localhost:3000/api/health)  
👉 **API System Status:** [http://localhost:3000/api/status](http://localhost:3000/api/status)

---

## 🛠️ បច្ចេកវិទ្យាដែលប្រើ (Tech Stack)
- **Backend:** Node.js (v24), Express.js (v5), dotenv, cors
- **Frontend:** HTML5, Modern Vanilla JavaScript (ES6+), Tailwind CSS v4
- **Dev Tools:** Nodemon, Tailwind CLI, Git

---

## 🌿 Git Version Control
គម្រោងនេះត្រូវបាន Setup Git repo រួចជាស្រេចនៅលើ `main` branch ជាមួយ `.gitignore` ត្រឹមត្រូវតាមស្តង់ដារ។
