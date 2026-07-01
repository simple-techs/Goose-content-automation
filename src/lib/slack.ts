export async function sendSlackNotification(
  webhookUrl: string,
  personaName: string,
  batchFolderUrl: string,
  imageCount: number,
  channel?: string
): Promise<void> {
  const payload: Record<string, unknown> = {
    text: `New content batch ready for *${personaName}*`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `New Content: ${personaName}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${imageCount}* new images generated and uploaded to Google Drive.`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "View in Drive",
          },
          url: batchFolderUrl,
          action_id: "view_drive",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Generated at ${new Date().toISOString()}`,
          },
        ],
      },
    ],
  };

  if (channel) {
    payload.channel = channel;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Slack notification failed (${res.status}): ${errText}`);
  }
}
