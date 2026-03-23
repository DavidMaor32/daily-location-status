import { Telegraf } from "telegraf";
import { MyBotContext } from "../TelegramBot";
import { UserDal } from "../../../modules/User/dal";
import { mainKeyboard } from "../keyboards";

export const registerHandler = (bot: Telegraf<MyBotContext>, userDal: UserDal) => {

    bot.start((ctx) => {
        ctx.session.step = "WAITING_FOR_FULL_NAME";
        return ctx.reply("שלום! מה השם שלך?");
    });

    bot.on("text", async (ctx, next) => {
        console.log("text");
        const step = ctx.session.step;

        if (!ctx.session.step) return next();
        
        if(step === "WAITING_FOR_FULL_NAME") {
            ctx.session.fullName = ctx.message.text;
            ctx.session.step = "WAITING_FOR_PHONE_NUMBER";
            return ctx.reply("מה המספר טלפון שלך?")
        }

        if(step === "WAITING_FOR_PHONE_NUMBER") {
            ctx.session.phone = ctx.message.text;

            const user = await userDal.getUserByNameAndPhone( {fullName: ctx.session.fullName!, phone: ctx.session.phone!});

            if(!user){
                ctx.session.step = "WAITING_FOR_FULL_NAME";
                ctx.reply("משתמש לא נמצא, נסה נשנית.");
                ctx.reply("שלום! מה השם שלך?");
                return;
            }

            ctx.session.userId = user.id;

            await userDal.updateUser({id: user.id, telegramUserId: ctx.message.from.id.toString()});

            ctx.session.step = undefined;

            return ctx.reply("ההרשמה בוצעה בהצלחה!", mainKeyboard());
        }

        return next();
    });

};