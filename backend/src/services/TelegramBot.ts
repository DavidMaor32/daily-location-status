import { LocationDal } from "../modules/Location/dal";
import { LocationReportDal } from "../modules/LocationReport/dal";
import { UserDal } from "../modules/User/dal";

export class TelegramBot {
  constructor(
    userDal: UserDal,
    locationDal: LocationDal,
    locationReportDal: LocationReportDal,
  ) {}
}
