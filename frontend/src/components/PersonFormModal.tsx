// Modal component for adding/editing one person in today's snapshot.
import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import {
  DAILY_STATUS_BAD,
  DAILY_STATUS_MISSING,
  DAILY_STATUS_OK,
} from "../constants/statuses.ts";

type PersonFormData = {
  full_name: string;
  location: string;
  daily_status: string;
  notes: string;
};

type PersonFormInitialData = Partial<PersonFormData> | null;

type PersonFormMode = "add" | "edit";

type PersonFormModalProps = {
  open: boolean;
  mode: PersonFormMode;
  initialData: PersonFormInitialData;
  locationOptions: string[];
  onClose: () => void;
  onSubmit: (payload: PersonFormData) => void;
  onDelete: () => void;
  loading: boolean;
};

// Modal form used for both add-person and edit-person actions.
const PersonFormModal = (props: PersonFormModalProps) => {
  const {
    open,
    mode,
    initialData,
    locationOptions,
    onClose,
    onSubmit,
    onDelete,
    loading,
  } = props;

  const homeLocation = locationOptions[0] || "בבית";
  const defaultForm: PersonFormData = {
    full_name: "",
    location: homeLocation,
    daily_status: DAILY_STATUS_MISSING,
    notes: "",
  };
  const [form, setForm] = useState<PersonFormData>(defaultForm);

  // Populate form with current person data when opening edit mode.
  useEffect(() => {
    if (!open) {
      return;
    }

    if (initialData) {
      setForm({
        full_name: initialData.full_name || "",
        location: initialData.location || homeLocation,
        daily_status: initialData.daily_status || DAILY_STATUS_MISSING,
        notes: initialData.notes || "",
      });
      return;
    }

    setForm(defaultForm);
  }, [open, initialData, homeLocation]);

  if (!open) {
    return null;
  }

  const title = mode === "edit" ? "עריכת איש" : "הוספת איש חדש";

  // Submit a normalized payload to the parent component.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      full_name: form.full_name.trim(),
      location: form.location,
      daily_status: form.daily_status,
      notes: form.notes.trim(),
    });
  };

  const handleModalClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={handleModalClick}>
        <h3>{title}</h3>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label>
            שם מלא
            <input
              value={form.full_name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, full_name: event.target.value }))
              }
              required
              minLength={2}
            />
          </label>

          <label>
            מיקום
            <select
              value={form.location}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, location: event.target.value }))
              }
            >
              {locationOptions.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </label>

          <label>
            סטטוס יומי
            <select
              value={form.daily_status}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, daily_status: event.target.value }))
              }
            >
              <option value={DAILY_STATUS_OK}>תקין</option>
              <option value={DAILY_STATUS_BAD}>לא תקין</option>
              <option value={DAILY_STATUS_MISSING}>לא הוזן</option>
            </select>
          </label>

          <label>
            הערות (אופציונלי)
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, notes: event.target.value }))
              }
              rows={3}
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              ביטול
            </button>
            {mode === "edit" ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={onDelete}
                disabled={loading}
              >
                מחק איש
              </button>
            ) : null}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "שומר..." : "שמירה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PersonFormModal;
