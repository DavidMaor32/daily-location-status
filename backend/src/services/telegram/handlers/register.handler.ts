import { Telegraf } from "telegraf";
import { MyBotContext } from "../TelegramBot";
import { UserDal } from "../../../modules/User/dal";
import { mainKeyboard } from "../keyboards";
import { WAITING_FOR_FULL_NAME, WAITING_FOR_PHONE_NUMBER, WAITING_FOR_STATUS_REPORT } from "../consts/step.consts";
import { successfullyRegistered, userWasNotFound, whatIsYourName, whatIsYourPhoneNumber } from "../consts/output.consts";

export const registerHandler = (bot: Telegraf<MyBotContext>, userDal: UserDal) => {

    bot.start((ctx) => {
        ctx.session.step = WAITING_FOR_FULL_NAME;
        return ctx.reply(whatIsYourName());
    });

    bot.on("text", async (ctx, next) => {
        console.log("text");
        const step = ctx.session.step;

        if (!ctx.session.step) return next();
        
        if(step === WAITING_FOR_FULL_NAME) {
            ctx.session.fullName = ctx.message.text;
            ctx.session.step = WAITING_FOR_PHONE_NUMBER;
            return ctx.reply(whatIsYourPhoneNumber())
        }

        if(step === WAITING_FOR_PHONE_NUMBER) {
            ctx.session.phone = ctx.message.text;

            const user = await userDal.getUserByNameAndPhone( {fullName: ctx.session.fullName!, phone: ctx.session.phone!});

            if(!user){
                ctx.session.step = WAITING_FOR_FULL_NAME;
                ctx.reply(userWasNotFound());
                ctx.reply(whatIsYourName());
                return;
            }

            ctx.session.userId = user.id;

            await userDal.updateUser({id: user.id, telegramUserId: ctx.message.from.id.toString()});

            ctx.session.step = WAITING_FOR_STATUS_REPORT;

            return ctx.reply(successfullyRegistered(), mainKeyboard());
        }

        return next();
    });

};