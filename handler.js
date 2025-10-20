import { POSTMARK_TEMPLATE_ID } from "./contants";
import { sendEmailWithTemplate } from "./post-mark.js";
import { createPass } from "./lite-card.js";
import sf from "./sales-force.js";

const handler = async ({ id, firstName, lastName, email, memberId }) => {
  const payload = {
    firstName,
    lastName,
    email,
    memberId,
  };

  const { apple_link, google_link, card_id } = await createPass(payload);

  console.log("Pass created", { apple_link, google_link, card_id });

  const result = await sf().sobject("Member__c").update({
    Id: id,
    Pass_ID__c: card_id,
  });

  console.log("Salesforce updated", result);

  if (!result.success) {
    throw new Error("Failed to create lead record");
  }

  const emailResponse = await sendEmailWithTemplate({
    To: email,
    From: "no-reply@thecommons.com.au",
    TemplateId: Number(POSTMARK_TEMPLATE_ID) || 0,
    TemplateModel: {
      litecard_apple_url: apple_link,
      litecard_google_url: google_link,
    },
  });

  console.log("Email sent", emailResponse);
};

export default handler;
