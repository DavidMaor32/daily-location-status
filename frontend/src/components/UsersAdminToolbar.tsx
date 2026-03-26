import {
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRef, useState, type ChangeEvent } from "react";

type UsersAdminToolbarProps = {
  busy: boolean;
  onAddUser: (payload: { fullName: string; phone: string }) => Promise<boolean>;
  onExcelImport: (file: File) => Promise<boolean>;
};

function UsersAdminToolbar({
  busy,
  onAddUser,
  onExcelImport,
}: UsersAdminToolbarProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddUserClick = async () => {
    const ok = await onAddUser({
      fullName: fullName.trim(),
      phone: phone.trim(),
    });
    if (ok) {
      setFullName("");
      setPhone("");
    }
  };

  const handleExcelChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    await onExcelImport(file);
  };

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderRadius: 2 }}
      component="section"
      aria-label="ניהול משתמשים"
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
            הוספת משתמש
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <TextField
              size="small"
              label="שם מלא"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleAddUserClick();
                }
              }}
              disabled={busy}
              sx={{ minWidth: 160, flex: "1 1 140px" }}
            />
            <TextField
              size="small"
              label="טלפון"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleAddUserClick();
                }
              }}
              disabled={busy}
              sx={{ minWidth: 140, flex: "1 1 120px" }}
            />
            <Button
              variant="outlined"
              onClick={() => void handleAddUserClick()}
              disabled={busy || !fullName.trim() || !phone.trim()}
              sx={{ flexShrink: 0 }}
            >
              הוסף משתמש
            </Button>
          </Stack>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
            ייבוא משתמשים מאקסל (עמודות: שם מלא, טלפון)
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              tabIndex={-1}
              aria-hidden
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clip: "rect(0, 0, 0, 0)",
                whiteSpace: "nowrap",
                border: 0,
              }}
              onChange={(event) => void handleExcelChange(event)}
              disabled={busy}
            />
            <Button
              variant="outlined"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              העלאת קובץ אקסל
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}

export default UsersAdminToolbar;
