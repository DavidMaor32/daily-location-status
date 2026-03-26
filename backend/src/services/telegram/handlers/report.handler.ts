import { Telegraf } from "telegraf";
import { MyBotContext } from "../TelegramBot";
import { UserDal } from "../../../modules/User/dal";
import { LocationDal } from "../../../modules/Location/dal";
import { LocationReportDal } from "../../../modules/LocationReport/dal";
import { addNotesDialogueKeyboard, locationKeyboard, mainKeyboard, statusKeyboard } from "../keyboards";
import { whatIsYourLocation, doYouHaveAnyNotes, writeYourNote, whatIsYourStatus, reportStatus, invalidLocation, invalidReportInitialization, invalidStatus, chooseYesOrNo, reportSummary, doYouWantToAddAnotherStatus } from "../consts/output.consts";
import { no, notOk, ok, yes } from "../consts/inputs.consts";
import { WAITING_FOR_LOCATION, WAITING_FOR_NOTES, WAITING_FOR_NOTES_TEXT, WAITING_FOR_STATUS, WAITING_FOR_STATUS_REPORT } from "../consts/step.consts";


export const reportHandler = async (bot: Telegraf<MyBotContext>, userDal: UserDal, locationDal: LocationDal, locationReportDal: LocationReportDal) => {
    bot.hears(reportStatus(), async (ctx) => {
        ctx.session.step = WAITING_FOR_LOCATION;
        const locations = await locationDal.getAllLocations();
        const locationNames = locations.map((l) => l.name);
        return ctx.reply(whatIsYourLocation(ctx.session.fullName!), locationKeyboard(locationNames));
    });

    bot.hears([ok(), notOk()], async (ctx) => {
        if(ctx.session.step !== WAITING_FOR_STATUS) return;

        ctx.session.isStatusOk = ctx.message.text === ok();

        ctx.session.step = WAITING_FOR_NOTES;

        return ctx.reply(doYouHaveAnyNotes(), addNotesDialogueKeyboard());
    });

    bot.hears([yes(), no()], async (ctx) => {
        if (ctx.session.step !== WAITING_FOR_NOTES) return;

        if (ctx.message.text === yes()) {
            ctx.session.step = WAITING_FOR_NOTES_TEXT;
            return ctx.reply(writeYourNote(), {reply_markup: {remove_keyboard: true}});
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

        ctx.session.step = WAITING_FOR_STATUS_REPORT;
        const location = await locationDal.getLocationById(ctx.session.locationId!);
        await ctx.reply(reportSummary(ctx.session.fullName!, location?.name, (ctx.session.isStatusOk ? ok() : notOk()), ctx.session.notes))
        return ctx.reply(doYouWantToAddAnotherStatus(), mainKeyboard());
    });


    bot.on("text", async (ctx) => {
        if (ctx.session.step === WAITING_FOR_LOCATION) {
            const locations = await locationDal.getAllLocations();
            const locationNames = locations.map((l) => l.name);
            const location = locations.find((l) => l.name === ctx.message.text);
            if (!location) {
            return ctx.reply(invalidLocation(), locationKeyboard(locationNames));
            }
            ctx.session.locationId = location.id;
            ctx.session.step = WAITING_FOR_STATUS;
            return ctx.reply(whatIsYourStatus(), statusKeyboard());
        }

        if (ctx.session.step === WAITING_FOR_NOTES) {
            if (ctx.message.text !== yes() && ctx.message.text !== no()) {
                await ctx.reply(chooseYesOrNo())
                ctx.reply(doYouHaveAnyNotes(), addNotesDialogueKeyboard());
            }
        }

        if (ctx.session.step === WAITING_FOR_STATUS_REPORT) {
            if (ctx.message.text !== reportStatus()) {
                ctx.reply(invalidReportInitialization(), mainKeyboard());
            }
        }

        if (ctx.session.step === WAITING_FOR_STATUS) {
            if (ctx.message.text !== ok() && ctx.message.text !== notOk()) {
                await ctx.reply(invalidStatus())
                ctx.reply(whatIsYourStatus(), statusKeyboard());
            }
        }

        if (ctx.session.step === WAITING_FOR_NOTES_TEXT) {
            ctx.session.notes = ctx.message.text;
            await locationReportDal.addReport({
            userId: ctx.session.userId!,
            locationId: ctx.session.locationId!,
            occurredAt: new Date(),
            isStatusOk: ctx.session.isStatusOk!,
            notes: ctx.session.notes,
            source: "bot",
        });
        ctx.session.step = WAITING_FOR_STATUS_REPORT;
        const location = await locationDal.getLocationById(ctx.session.locationId!);
        await ctx.reply(reportSummary(ctx.session.fullName!, location?.name, (ctx.session.isStatusOk ? ok() : notOk()), ctx.session.notes))
        return ctx.reply(doYouWantToAddAnotherStatus(), mainKeyboard());
    }
});
}