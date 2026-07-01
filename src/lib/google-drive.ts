import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";
import type { DriveFolder, DriveFile } from "./types";

function getAuth() {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentials) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set");
  }

  const parsed = JSON.parse(credentials);
  return new google.auth.GoogleAuth({
    credentials: parsed,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

function getDrive(): drive_v3.Drive {
  return google.drive({ version: "v3", auth: getAuth() });
}

export async function listSubfolders(parentFolderId: string): Promise<DriveFolder[]> {
  const drive = getDrive();
  const folders: DriveFolder[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
      pageSize: 100,
      pageToken,
    });

    if (res.data.files) {
      for (const file of res.data.files) {
        folders.push({
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType!,
          webViewLink: file.webViewLink || `https://drive.google.com/drive/folders/${file.id}`,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return folders;
}

export async function listImagesInFolder(folderId: string): Promise<DriveFile[]> {
  const drive = getDrive();
  const images: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, webViewLink, thumbnailLink)",
      pageSize: 100,
      pageToken,
    });

    if (res.data.files) {
      for (const file of res.data.files) {
        images.push({
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType!,
          webViewLink: file.webViewLink || "",
          thumbnailLink: file.thumbnailLink ?? undefined,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return images;
}

export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function createSubfolder(
  parentFolderId: string,
  folderName: string
): Promise<{ id: string; webViewLink: string }> {
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id, webViewLink",
  });

  return {
    id: res.data.id!,
    webViewLink:
      res.data.webViewLink ||
      `https://drive.google.com/drive/folders/${res.data.id}`,
  };
}

export async function uploadImageToFolder(
  folderId: string,
  fileName: string,
  imageBuffer: Buffer,
  mimeType: string = "image/png"
): Promise<DriveFile> {
  const drive = getDrive();
  const stream = new Readable();
  stream.push(imageBuffer);
  stream.push(null);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id, name, mimeType, webViewLink",
  });

  return {
    id: res.data.id!,
    name: res.data.name!,
    mimeType: res.data.mimeType!,
    webViewLink: res.data.webViewLink || "",
  };
}

export async function setFolderPublicReadable(folderId: string): Promise<void> {
  const drive = getDrive();
  await drive.permissions.create({
    fileId: folderId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });
}
