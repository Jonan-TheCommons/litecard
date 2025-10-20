import fetch, { Headers } from "node-fetch";
import { POSTMARK_API_TOKEN } from "./contants.js";

export const sendEmailWithTemplate = async (payload) => {
  const headers = new Headers();

  headers.append("Accept", "application/json");
  headers.append("Content-Type", "application/json");
  headers.append("X-Postmark-Server-Token", POSTMARK_API_TOKEN);

  const body = JSON.stringify(payload);

  const options = {
    method: "POST",
    headers,
    body,
  };

  const res = await fetch("https://api.postmarkapp.com/email/withTemplate", options);

  if (!res.ok) {
    throw new Error(`Failed to send email: ${res.statusText}`);
  }

  const data = await res.json();

  return data;
};
