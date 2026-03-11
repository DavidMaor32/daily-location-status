# מערכת WEB לניהול סטטוס יומי ומיקום

אפליקציית **FastAPI + React** לניהול אנשים, מיקום יומי, סטטוס יומי והיסטוריה מלאה בקבצי **Excel (XLSX)**.

## מה המערכת עושה

- מציגה טבלה של כל האנשים בזמן אמת.
- מאפשרת עדכון מהיר של מיקום וסטטוס יומי.
- שומרת snapshot יומי מלא לכל תאריך.
- מאפשרת צפייה בהיסטוריה לפי יום.
- מייצאת קובץ Excel של יום בודד או ZIP של טווח תאריכים.
- תומכת בשמירה:
  - לוקאלית
  - ל-S3
  - במצב כפול: לוקאלי + S3

---

## הפעלה מהירה (Windows / PowerShell)

### 1) דרישות מקדימות

- Python 3.9+
- Node.js 18+
- npm

### 2) יצירת קבצי סביבה

מהשורש של הפרויקט:

```powershell
Copy-Item .env.example .env
Copy-Item frontend\.env.example frontend\.env
```

### 3) הרצת Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

בדיקת תקינות:

- פתח בדפדפן: `http://localhost:8000/api/health`
- תשובה צפויה: `{"status":"ok"}`

### 4) הרצת Frontend (טרמינל נוסף)

```powershell
cd frontend
npm install
npm run dev
```

### 5) כניסה למערכת

- Frontend: `http://localhost:5173`

---

## מצבי שמירה

`STORAGE_MODE` בקובץ `.env` שולט איפה הנתונים נשמרים:

- `local` - שמירה לוקאלית בלבד (ברירת מחדל).
- `s3` - שמירה ל-S3 בלבד.
- `local_and_s3` (או `dual` / `hybrid`) - שמירה לוקאלית + שכפול ל-S3.

---

## מצב שמירה כפולה (מומלץ לגיבוי)

ב־`.env` הגדר:

```env
STORAGE_MODE=local_and_s3
LOCAL_STORAGE_DIR=./local_storage

AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
S3_BUCKET_NAME=your_bucket_name

S3_SNAPSHOTS_PREFIX=snapshots
S3_MASTER_KEY=master/people_master.xlsx
S3_LOCATIONS_KEY=master/locations.xlsx
```

איך זה עובד:

- כתיבה: קודם ללוקאלי, ואז שכפול ל-S3.
- קריאה: קודם מלוקאלי; אם חסר קובץ, יש fallback ל-S3.
- אם S3 לא זמין, המערכת ממשיכה לעבוד לוקאלית.

> אחרי שינוי `.env` צריך לבצע restart ל-Backend.

---

## איפה הקבצים נשמרים

במצב `local` או `local_and_s3`:

- `local_storage/master/people_master.xlsx` - רשימת אנשים (Master).
- `local_storage/master/locations.xlsx` - רשימת מיקומים.
- `local_storage/snapshots/YYYY-MM-DD.xlsx` - snapshot יומי מלא.

פורמט שם קובץ יומי: `2026-03-11.xlsx`

---

## ייצוא קבצים

- הורדת יום בודד (XLSX):
  - `GET /api/export/day/{YYYY-MM-DD}`
- הורדת טווח תאריכים (ZIP עם קבצי XLSX):
  - `GET /api/export/range?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`

---

## API מרכזי

- `GET /api/health`
- `GET /api/snapshot/today`
- `GET /api/snapshot/{YYYY-MM-DD}`
- `GET /api/history/dates`
- `POST /api/history/{YYYY-MM-DD}/restore-to-today`
- `GET /api/locations`
- `POST /api/locations`
- `POST /api/people`
- `PATCH /api/people/{person_id}`
- `PUT /api/people/{person_id}`
- `DELETE /api/people/{person_id}`

---

## תקלות נפוצות ופתרון

### 1) `Seed people file was not found`

בדוק שב־`.env` מוגדר:

```env
SEED_PEOPLE_FILE=./backend/data/sample_people.csv
```

### 2) Frontend לא מתחבר ל-Backend (CORS / Network)

בדוק:

```env
CORS_ORIGINS=http://localhost:5173
VITE_API_BASE_URL=http://localhost:8000
```

### 3) שיניתי `.env` ולא קרה כלום

יש להפעיל מחדש את שרת ה-Backend (`uvicorn`).

### 4) מצב כפול ו-S3 נכשל

ב־`local_and_s3` הלוקאלי הוא הראשי, לכן הנתונים עדיין יישמרו לוקאלית גם אם S3 נכשל זמנית.

---

## העברה למחשב אחר

כדי להעביר את המערכת למחשב חדש:

1. העתק את כל תיקיית הפרויקט.
2. העתק/צור `.env` ו-`frontend/.env`.
3. הרץ מחדש:
   - Backend: `pip install -r backend/requirements.txt`
   - Frontend: `npm install` בתוך `frontend`
4. אם חשוב לשמור היסטוריה קיימת, העתק גם את תיקיית `local_storage`.

---

## מבנה תיקיות עיקרי

```text
app/
├─ backend/
│  ├─ app/
│  ├─ data/
│  └─ requirements.txt
├─ frontend/
├─ local_storage/
├─ .env.example
└─ README.md
```
