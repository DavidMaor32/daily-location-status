-- AlterTable
ALTER TABLE `Location` ADD COLUMN `is_archived` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `LocationReport` ADD COLUMN `is_archived` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `is_archived` BOOLEAN NOT NULL DEFAULT false;
