# הוראות הפעלה מהירות

המערכת עובדת עם קובץ קונפיגורציה אחד בלבד:

- `config/app_config.yaml`

לא נדרש `.env`.

## 1) דרישות

- Python 3.9 ומעלה
- Node.js 18 ומעלה
- npm

## 2) בדיקת קונפיגורציה

פתח וערוך:

- `config/app_config.yaml`

ערכים מומלצים לפיתוח מקומי:

- `storage.mode: "local"`
- `frontend.api_base_url: ""`
- `frontend.dev_server_port: 5173`
- `frontend.dev_proxy_target: "http://localhost:8000"`

## 3) הרצת Backend (טרמינל 1)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

בדיקת תקינות:

- `http://localhost:8000/api/health`
- תשובה תקינה: `{"status":"ok"}`

## 4) הרצת Frontend (טרמינל 2)

```powershell
cd frontend
npm install
npm run dev
```

כניסה למערכת:

- `http://localhost:5173`

## 5) בוט טלגרם (אופציונלי)

הפעל דרך `config/app_config.yaml`:

- `telegram.enabled: true`
- `telegram.bot_token: "YOUR_TOKEN"`

תהליך הזנה בבוט:

1. `/start`
2. בחירת שם
3. בחירת מיקום
4. בחירת סטטוס (`תקין` / `לא תקין`)
5. הודעת הצלחה/כישלון

אם הבוט לא פעיל:

- המערכת ממשיכה לעבוד רגיל.
- עמודות הזנה עצמאית יישארו ריקות.

## 6) תקלות נפוצות

### Backend לא עולה

- ודא שהפעלת venv:
  - `.\.venv\Scripts\Activate.ps1`
- ודא שהרצת:
  - `pip install -r requirements.txt`

### Frontend לא מתחבר ל-Backend

בדוק ב-`config/app_config.yaml`:

- `frontend.api_base_url: ""`
- `frontend.dev_proxy_target: "http://localhost:8000"`

### שיניתי קונפיגורציה ולא השתנה כלום

אחרי שינוי `config/app_config.yaml` צריך restart גם ל-Backend וגם ל-Frontend.
