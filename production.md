# production.md

מדריך הפעלה ל-Production (Ubuntu + systemd + Nginx)

## 1) התקנה חד-פעמית על השרת

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

בדיקת גרסאות:

```bash
python3 --version
node --version
npm --version
```

## 2) העתקת פרויקט והגדרת קבצים

```bash
cd /opt
sudo mkdir -p daily-status-app
sudo chown -R $USER:$USER daily-status-app
```

העתק את קבצי הפרויקט לתיקייה:

```bash
cd /opt/daily-status-app
```

ערוך קונפיגורציה:

```bash
nano config/app_config.yaml
```

צור קובץ `.env` (לא להעלות ל-git):

```bash
cat > .env << 'EOF'
TELEGRAM_BOT_TOKEN=PUT_YOUR_TOKEN_HERE
EOF
chmod 600 .env
```

## 3) התקנת Backend

```bash
cd /opt/daily-status-app/backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

בדיקת תקינות:

```bash
python -m pytest -q
python -m compileall app
```

## 4) Build ל-Frontend

```bash
cd /opt/daily-status-app/frontend
npm ci
npm run build
```

## 5) הפעלת Backend כ-service (systemd)

צור service:

```bash
sudo tee /etc/systemd/system/daily-status-backend.service > /dev/null << 'EOF'
[Unit]
Description=Daily Status Backend (FastAPI)
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/daily-status-app/backend
Environment=PYTHONUNBUFFERED=1
ExecStart=/opt/daily-status-app/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
```

שים לב:
- `--workers 1` הוא חובה במבנה הנוכחי (Excel + Telegram bot) כדי למנוע התנגשויות בין תהליכים.

הפעלת השירות:

```bash
sudo systemctl daemon-reload
sudo systemctl enable daily-status-backend
sudo systemctl start daily-status-backend
sudo systemctl status daily-status-backend --no-pager
```

## 6) הפעלת Frontend עם Nginx

צור קובץ Nginx:

```bash
sudo tee /etc/nginx/sites-available/daily-status > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    root /opt/daily-status-app/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
```

הפעלה:

```bash
sudo ln -sf /etc/nginx/sites-available/daily-status /etc/nginx/sites-enabled/daily-status
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

## 7) בדיקות Production אחרי עלייה

```bash
curl -sS http://127.0.0.1:8000/api/health
curl -sS http://127.0.0.1:8000/api/system/status
curl -I http://127.0.0.1/
```

## 8) פקודות תפעול שוטפות

סטטוס ולוגים:

```bash
sudo systemctl status daily-status-backend --no-pager
sudo journalctl -u daily-status-backend -f
sudo systemctl status nginx --no-pager
```

restart:

```bash
sudo systemctl restart daily-status-backend
sudo systemctl restart nginx
```

## 9) עדכון גרסה (Deploy חדש)

```bash
cd /opt/daily-status-app
# git pull (אם עובדים עם git)

cd backend
source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q

cd ../frontend
npm ci
npm run build

sudo systemctl restart daily-status-backend
sudo systemctl reload nginx
```

## 10) הערות חשובות

- אם בוט טלגרם פעיל, הרץ מופע Backend יחיד בלבד.
- אל תשמור טוקנים בתוך `config/app_config.yaml`; שמור אותם ב-`.env`.
- כל שינוי ב-`config/app_config.yaml` דורש restart ל-Backend.
