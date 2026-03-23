import { Markup } from "telegraf";

export const mainKeyboard = () => Markup.keyboard([["הזנת סטטוס"]]).resize();

const ROW_SIZE = 2;

export const locationKeyboard = (locationNames: string[]) => {
  const rows: string[][] = [];
  for (let i = 0; i < locationNames.length; i += ROW_SIZE) {
    rows.push(locationNames.slice(i, i + ROW_SIZE));
  }
  return Markup.keyboard(rows).resize();
};


export const statusKeyboard = () => Markup.keyboard([["תקין", "לא תקין"]]).resize();