export const whatIsYourLocation = (name: string) => `שלום! ${name} \n איפה אתה נמצא?`;
export const whatIsYourStatus = () => "מה הסטטוס שלך?";
export const doYouWantToAddAnotherStatus = () => "רוצה לעדכן שוב?";
export const reportStatus = () => "הזנת סטטוס";
export const whatIsYourName = () => "שלום! מה השם שלך?";
export const whatIsYourPhoneNumber = () => "מה המספר טלפון שלך?";
export const userWasNotFound = () => "משתמש לא נמצא, נסה נשנית.";
export const successfullyRegistered = () => "ההרשמה בוצעה בהצלחה!";
export const doYouHaveAnyNotes = () => "יש לך הערות להוסיף?";
export const writeYourNote = () => "הזן את ההערה שלך:";
export const invalidLocation = () => "נא לבחור מיקום מהרשימה.";
export const invalidStatus = () => "נא לבחור בסטטוס מבין שתי האפשרויות.";
export const invalidReportInitialization = () => "בשביל להתחיל אנא ללחוץ על ה\"הזנת סטטוס\".";
export const chooseYesOrNo = () => "נא לבחור בכן או לא.";
export const reportSummary = (name: string, location: string, status: string, notes?: string | null) => 
  `ההזנה נקלטה בהצלחה!\nשם: ${name}.\nמיקום: ${location}.\nסטטוס: ${status ? "תקין" : "לא תקין"}.\nהערות: ${notes ?? "ללא"}.`;