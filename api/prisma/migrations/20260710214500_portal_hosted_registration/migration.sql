-- Registration now happens on the portal's own page (jfa-go POST /user);
-- invite links are no longer part of the customer flow.
ALTER TABLE "Payment" DROP COLUMN "invite_code";
ALTER TABLE "Payment" DROP COLUMN "invite_url";
