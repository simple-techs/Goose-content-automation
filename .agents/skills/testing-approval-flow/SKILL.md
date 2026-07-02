---
name: testing-approval-flow
description: Test the Soul ID approval workflow end-to-end. Use when verifying the approval modal, persona status transitions, or Higgsfield OAuth integration changes.
---

# Testing the Soul ID Approval Flow

## Overview
The approval flow allows users to review preview images generated from a newly trained Soul ID before the persona is marked as active.

## Flow Under Test
1. Persona starts as `pending` → onboard creates Soul ID → generates preview images → status becomes `pending_approval`
2. User clicks purple "Review" button → Approval modal opens showing image grid
3. User selects/deselects images → clicks "Approve Soul ID" → persona becomes `active`
4. Or clicks "Reject & Re-train" → confirms → persona resets to `pending`

## Test Setup

### Creating Test Data
Since the full onboard pipeline requires real Higgsfield API calls and takes ~10 minutes, simulate the `pending_approval` state via SQL:

```sql
-- Set a persona to pending_approval
UPDATE personas SET status = 'pending_approval', higgsfield_soul_id = 'test-soul-id-for-approval', image_count = 5
WHERE id = '<persona_id>';

-- Insert mock approval images (use public placeholder images)
INSERT INTO approval_images (persona_id, image_url) VALUES
  ('<persona_id>', 'https://picsum.photos/seed/soul1/400/533'),
  ('<persona_id>', 'https://picsum.photos/seed/soul2/400/533'),
  ('<persona_id>', 'https://picsum.photos/seed/soul3/400/533'),
  ('<persona_id>', 'https://picsum.photos/seed/soul4/400/533');
```

Use the Supabase MCP tool with `project_id: "tahoremaufwulpiizxwy"` to run these queries.

### Verifying via API
```bash
# Check persona status
curl -s "https://goose-content-automation.vercel.app/api/personas" | python3 -c "import sys,json; [print(p['name'], p['status']) for p in json.load(sys.stdin)['personas'] if 'test_name' in p['name']]"

# Check approval images
curl -s "https://goose-content-automation.vercel.app/api/approval?personaId=<id>"
```

## Key UI Elements to Verify
- **Settings page**: "API Key Connected" + "Image Generation Auth: Connected" with "Reconnect Higgsfield" button
- **Dashboard**: Purple `pending_approval` badge, purple "Review" button in Actions column, "X awaiting approval" counter
- **Approval modal**: 2-column image grid, blue checkmark circles for selected images, "X of Y selected" counter, green "Approve Soul ID" button, red "Reject & Re-train" button

## Assertions After Approve
- Persona status changes to `active`
- Review button disappears
- "awaiting approval" counter updates/disappears
- Active count in stats bar increments

## Assertions After Reject
- Browser confirmation dialog appears: "Reject Soul ID for <name>? This will reset them to pending for re-training."
- Persona status changes to `pending`
- Soul ID cleared (shows "--")
- Error message appears: "Soul ID rejected — ready to re-train"
- Approval images deleted (API returns empty array)

## Environment
- Deployed at: https://goose-content-automation.vercel.app
- Supabase project: `tahoremaufwulpiizxwy`
- The app uses Next.js 16 with Turbopack

## Devin Secrets Needed
- `HIGGSFIELD_API_KEY` — for soul creation via REST API
- Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) — for Drive integration
- Supabase credentials (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) — for database access

## Common Issues
- Browser may need a hard refresh (F5) after SQL updates to see status changes
- The approval modal shows ALL approval_images for the persona — if you previously approved and then reset, old images may still be present. Clean them up with: `DELETE FROM approval_images WHERE persona_id = '<id>'`
- Chrome on the testing VM might crash when confirming browser dialogs. Verify rejection via API if browser becomes unresponsive.
