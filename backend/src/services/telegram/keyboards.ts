import { Markup } from "telegraf";

export const mainKeyboard = () => Markup.keyboard([["הזנת סטטוס"]]).resize();

export const locationKeyboard = () =>
    Markup.keyboard([
      ["בבית", "מיקום 1"],
      ["מיקום 2", "מיקום 3"],
      ["מיקום 4", "מיקום 5"],
    ]).resize();


export const statusKeyboard = () => Markup.keyboard([["תקין", "לא תקין"]]).resize();