import { Telegraf } from "telegraf";
import { MyBotContext } from "../TelegramBot";
import { UserDal } from "../../../modules/User/dal";
import { LocationDal } from "../../../modules/Location/dal";
import { LocationReportDal } from "../../../modules/LocationReport/dal";
import { addNotesDialogueKeyboard, locationKeyboard, mainKeyboard, statusKeyboard } from "../keyboards";


export const reportHandler = async (bot: Telegraf<MyBotContext>, userDal: UserDal, locationDal: LocationDal, locationReportDal: LocationReportDal) => {
    bot.hears("הזנת סטטוס", async (ctx) => {
        ctx.session.step = "WAITING_FOR_LOCATION";
        const locations = await locationDal.getAllLocations();
        const locationNames = locations.map((l) => l.name);
        return ctx.reply(`שלום! ${ctx.session.fullName} \n איפה אתה נמצא?`, locationKeyboard(locationNames));
    });

    bot.hears(["תקין", "לא תקין"], async (ctx) => {
        if(ctx.session.step !== "WAITING_FOR_STATUS") return;

        ctx.session.isStatusOk = ctx.message.text === "תקין";

        ctx.session.step = "WAITING_FOR_NOTES";
        const location = await locationDal.getLocationById(ctx.session.locationId!);

        return ctx.reply("יש לך הערות להוסיף?", addNotesDialogueKeyboard());
    });

    bot.hears(["כן", "לא"], async (ctx) => {
        if (ctx.session.step !== "WAITING_FOR_NOTES") return;

        if (ctx.message.text === "כן") {
            ctx.session.step = "WAITING_FOR_NOTES_TEXT";
            return ctx.reply("הזן את ההערה שלך:", {reply_markup: {remove_keyboard: true}});
        }

        ctx.session.notes = undefined;
        await locationReportDal.addReport({
            userId: ctx.session.userId!,
            locationId: ctx.session.locationId!,
            occurredAt: new Date(),
            isStatusOk: ctx.session.isStatusOk!,
            notes: null,
            source: "bot",
        });

        ctx.session.step = undefined;
        const location = await locationDal.getLocationById(ctx.session.locationId!);
        ctx.reply(`ההזנה נקלטה בהצלחה!\nשם: ${ctx.session.fullName}.\nמיקום: ${location?.name}.\nסטטוס: ${ctx.session.isStatusOk ? "תקין" : "לא תקין"}.\nהערות: ללא.`);
        return ctx.reply("רוצה לעדכן שוב?", mainKeyboard());
    });


    bot.on("text", async (ctx) => {
        if (ctx.session.step === "WAITING_FOR_LOCATION") {
            const locations = await locationDal.getAllLocations();
            const location = locations.find((l) => l.name === ctx.message.text);
            if (!location) {
            return ctx.reply("נא לבחור מיקום מהרשימה.");
            }
            ctx.session.locationId = location.id;
            ctx.session.step = "WAITING_FOR_STATUS";
            return ctx.reply("מה הסטטוס שלך?", statusKeyboard());
        }

        if (ctx.session.step === "WAITING_FOR_NOTES_TEXT") {
            ctx.session.notes = ctx.message.text;
            await locationReportDal.addReport({
            userId: ctx.session.userId!,
            locationId: ctx.session.locationId!,
            occurredAt: new Date(),
            isStatusOk: ctx.session.isStatusOk!,
            notes: ctx.session.notes,
            source: "bot",
        });
        ctx.session.step = undefined;
        const location = await locationDal.getLocationById(ctx.session.locationId!);
        ctx.reply(`ההזנה נקלטה בהצלחה!\nשם: ${ctx.session.fullName}.\nמיקום: ${location?.name}.\nסטטוס: ${ctx.session.isStatusOk ? "תקין" : "לא תקין"}.\nהערות: ${ctx.session.notes}.`);
        return ctx.reply("רוצה לעדכן שוב?", mainKeyboard());
    }
});
}