import { useEffect, useMemo, useState } from "react";
import { getLocationChipClass } from "../constants/locations";
import {
  DAILY_STATUS_BAD,
  DAILY_STATUS_MISSING,
  DAILY_STATUS_OK,
  getDailyStatusChipClass,
} from "../constants/statuses";

function toLocalDateTimeInput(value) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toUtcIsoFromLocalInput(value) {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function formatEventTimestamp(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("he-IL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEventType(eventType) {
  if (eventType === "undo") {
    return "ביטול";
  }
  if (eventType === "correction") {
    return "תיקון";
  }
  return "עדכון מיקום";
}

function PersonTrackingModal({
  open,
  person,
  readOnly,
  loading,
  locationOptions,
  events,
  transitions,
  latestTransitionWarning,
  canUndo,
  undoSecondsLeft,
  onClose,
  onAddEvent,
  onDeleteEvent,
  onUndoLastAction,
}) {
  const [form, setForm] = useState({
    location: "",
    daily_status: DAILY_STATUS_MISSING,
    occurred_at_local: "",
  });

  useEffect(() => {
    if (!open || !person) {
      return;
    }
    setForm({
      location: person.location || locationOptions[0] || "",
      daily_status: person.daily_status || DAILY_STATUS_MISSING,
      occurred_at_local: toLocalDateTimeInput(new Date()),
    });
  }, [open, person, locationOptions]);

  const safeEvents = Array.isArray(events) ? events : [];
  const safeTransitions = Array.isArray(transitions) ? transitions : [];
  const transitionByToEventId = useMemo(() => {
    const mapping = new Map();
    safeTransitions.forEach((item) => {
      mapping.set(String(item.to_event_id || ""), item);
    });
    return mapping;
  }, [safeTransitions]);

  if (!open || !person) {
    return null;
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    onAddEvent({
      location: form.location,
      daily_status: form.daily_status,
      occurred_at: toUtcIsoFromLocalInput(form.occurred_at_local),
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal tracking-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{`מעקב מיקומים - ${person.full_name}`}</h3>

        {latestTransitionWarning ? (
          <div className="tracking-warning">{latestTransitionWarning}</div>
        ) : null}

        {!readOnly ? (
          <form className="modal-form tracking-form" onSubmit={handleSubmit}>
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
              סטטוס
              <select
                value={form.daily_status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    daily_status: event.target.value,
                  }))
                }
              >
                <option value={DAILY_STATUS_OK}>תקין</option>
                <option value={DAILY_STATUS_BAD}>לא תקין</option>
                <option value={DAILY_STATUS_MISSING}>לא הוזן</option>
              </select>
            </label>

            <label>
              זמן אירוע
              <input
                type="datetime-local"
                value={form.occurred_at_local}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    occurred_at_local: event.target.value,
                  }))
                }
              />
            </label>

            <div className="modal-actions tracking-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || !form.location}
              >
                הוסף אירוע
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loading || !canUndo}
                onClick={onUndoLastAction}
              >
                {canUndo ? `Undo (${undoSecondsLeft})` : "Undo"}
              </button>
            </div>
          </form>
        ) : (
          <div className="muted-text tracking-readonly-note">
            תצוגת היסטוריה בלבד. הוספה ומחיקה זמינות רק ביום הנוכחי.
          </div>
        )}

        <div className="tracking-events-list">
          <h4>אירועים</h4>
          {safeEvents.length === 0 ? (
            <div className="muted-text">אין אירועי מיקום לאדם זה בתאריך שנבחר.</div>
          ) : (
            safeEvents.map((item) => {
              const transition = transitionByToEventId.get(String(item.event_id));
              return (
                <div
                  className={`tracking-event-row ${item.is_voided ? "voided-event" : ""}`}
                  key={item.event_id}
                >
                  <div className="tracking-event-meta">
                    <strong>{formatEventTimestamp(item.occurred_at)}</strong>
                    <span className="status-chip neutral-chip">
                      {`סוג: ${formatEventType(item.event_type)}`}
                    </span>
                    <span
                      className={`status-chip ${getLocationChipClass(item.location)}`}
                    >
                      {`מיקום: ${item.location}`}
                    </span>
                    <span
                      className={`status-chip ${getDailyStatusChipClass(
                        item.daily_status
                      )}`}
                    >
                      {`סטטוס: ${item.daily_status}`}
                    </span>
                    {item.is_voided ? (
                      <span className="status-chip warning-chip">נמחק</span>
                    ) : null}
                  </div>
                  <div className="tracking-event-details">
                    {transition ? (
                      <small>{`מעבר: מ-${transition.from_location} ל-${transition.to_location}`}</small>
                    ) : item.event_type === "move" ? (
                      <small>תחילת רצף (ללא מעבר קודם)</small>
                    ) : null}
                    <small>{`Event ID: ${item.event_id}`}</small>
                  </div>
                  {!readOnly && item.event_type === "move" && !item.is_voided ? (
                    <button
                      className="btn btn-danger btn-small"
                      onClick={() => onDeleteEvent(item.event_id)}
                      disabled={loading}
                    >
                      מחק אירוע
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div className="tracking-transitions-list">
          <h4>מעברים מחושבים</h4>
          {safeTransitions.length === 0 ? (
            <div className="muted-text">אין מעברים מחושבים לתאריך זה.</div>
          ) : (
            safeTransitions.map((item) => (
              <div className="tracking-transition-row" key={item.transition_id}>
                <strong>{`מ-${item.from_location} ל-${item.to_location}`}</strong>
                <span>{formatEventTimestamp(item.moved_at)}</span>
                <span>{`שהייה: ${item.dwell_minutes} דקות`}</span>
              </div>
            ))
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

export default PersonTrackingModal;
