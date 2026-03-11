import { useEffect, useState } from "react";

const defaultForm = {
  full_name: "",
  location: "בבית",
  daily_status: "תקין",
  notes: "",
};

// Modal form used for both add-person and edit-person actions.
function PersonFormModal({
  open,
  mode,
  initialData,
  locationOptions,
  onClose,
  onSubmit,
  onDelete,
  loading,
}) {
  const [form, setForm] = useState(defaultForm);

  // Populate form with current person data when opening edit mode.
  useEffect(() => {
    if (!open) {
      return;
    }

    if (initialData) {
      setForm({
        full_name: initialData.full_name || "",
        location: initialData.location || "בבית",
        daily_status: initialData.daily_status || "תקין",
        notes: initialData.notes || "",
      });
      return;
    }

    setForm(defaultForm);
  }, [open, initialData]);

  if (!open) {
    return null;
  }

  const title = mode === "edit" ? "עריכת אדם" : "הוספת אדם חדש";

  // Submit a normalized payload to the parent component.
  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      full_name: form.full_name.trim(),
      location: form.location,
      daily_status: form.daily_status,
      notes: form.notes.trim(),
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
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
              <option value="תקין">תקין</option>
              <option value="לא תקין">לא תקין</option>
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
                מחק אדם
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
}

export default PersonFormModal;
