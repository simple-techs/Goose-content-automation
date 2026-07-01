import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";
import type { DriveFolder, DriveFile } from "./types";
import { getSupabaseAdmin } from "./supabase";

async function getAuth() {
  // Try OAuth2 first (refresh token stored in database)
  const db = getSupabaseAdmin();
  const { data: settings } = await db
    .from("app_settings")
    .select("google_refresh_token")
    .limit(1)
    .single();

  if (settings?.google_refresh_token) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: settings.google_refresh_token });
    return oauth2Client;
  }

  // Fallback to service account if available
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (credentials) {
    const parsed = JSON.parse(credentials);
    return new google.auth.GoogleAuth({
      credentials: parsed,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
  }

  throw new Error(
    "Google Drive not connected. Go to Settings and click 'Connect Google Drive'."
  );
}

async function getDrive(): Promise<drive_v3.Drive> {
  const auth = await getAuth();
  return google.drive({ version: "v3", auth });
}

export async function listSubfolders(parentFolderId: string): Promise<DriveFolder[]> {
  const drive = await getDrive();
  const folders: DriveFolder[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
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
  const drive = await getDrive();
  const images: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, webViewLink, thumbnailLink)",
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
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
  const drive = await getDrive();
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function createSubfolder(
  parentFolderId: string,
  folderName: string
): Promise<{ id: string; webViewLink: string }> {
  const drive = await getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id, webViewLink",
    supportsAllDrives: true,
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
  const drive = await getDrive();
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
    supportsAllDrives: true,
  });

  return {
    id: res.data.id!,
    name: res.data.name!,
    mimeType: res.data.mimeType!,
    webViewLink: res.data.webViewLink || "",
  };
}

export async function listAllImagesRecursive(folderId: string): Promise<DriveFile[]> {
  const directImages = await listImagesInFolder(folderId);
  const subfolders = await listSubfolders(folderId);

  const subfolderImages = await Promise.all(
    subfolders.map((sf) => listImagesInFolder(sf.id))
  );

  return [...directImages, ...subfolderImages.flat()];
}

export async function setFolderPublicReadable(folderId: string): Promise<void> {
  const drive = await getDrive();
  await drive.permissions.create({
    fileId: folderId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
    supportsAllDrives: true,
  });
}
