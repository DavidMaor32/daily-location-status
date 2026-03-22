import { Telegraf } from "telegraf";
import { MyBotContext } from "../TelegramBot";
import { UserDal } from "../../../modules/User/dal";
import { LocationDal } from "../../../modules/Location/dal";
import { LocationReportDal } from "../../../modules/LocationReport/dal";
import { locationKeyboard, mainKeyboard, statusKeyboard } from "../keyboards";


export const reportHandler = async (bot: Telegraf<MyBotContext>, userDal: UserDal, locationDal: LocationDal, locationReportDal: LocationReportDal) => {
    const locations = await locationDal.getAllLocations();
    const locationsNames = locations.map((location) => location.name);
console.log(locationsNames);

    bot.hears("הזנת סטטוס", (ctx) => {
        ctx.session.step = "WAITING_FOR_LOCATION";
        return ctx.reply(`שלום! ${ctx.session.fullName} \n איפה אתה נמצא?`, locationKeyboard());
    })

    bot.hears(locationsNames, (ctx) => {
        if(ctx.session.step !== "WAITING_FOR_LOCATION") return;
        ctx.session.locationId = locations.find((location) => location.name === ctx.message.text)?.id;
        
        ctx.session.step = "WAITING_FOR_STATUS";
        return ctx.reply("מה הסטטוס שלך?", statusKeyboard());

    });

    bot.hears(["תקין", "לא תקין"], async (ctx) => {
        if(ctx.session.step !== "WAITING_FOR_STATUS") return;

        const isOk = ctx.message.text === "תקין";

        await locationReportDal.addReport({
            userId: ctx.session.userId!,
            locationId: ctx.session.locationId!,
            occurredAt: new Date(),
            isStatusOk: isOk,
            source: "bot",
        })

        ctx.session.step = undefined;
        const location = await locationDal.getLocationById(ctx.session.locationId!);
        ctx.reply(`ההזנה נקלטה בהצלחה!\nשם: ${ctx.session.fullName}.\nמיקום: ${location?.name}.\nסטטוס: ${isOk ? "תקין" : "לא תקין"}.`);

        return ctx.reply("רוצה לעדכן שוב?", mainKeyboard());
    })

}