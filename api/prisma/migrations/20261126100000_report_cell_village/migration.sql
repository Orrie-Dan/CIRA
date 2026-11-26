-- Rwanda administrative levels below sector (Province > District > Sector > Cell > Village).
ALTER TABLE "report" ADD COLUMN "cell" TEXT,
ADD COLUMN "village" TEXT;
