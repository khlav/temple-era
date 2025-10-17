# Canonical URLs and Vercel Preview Blocking - Deployment Checklist

## Pre-Deployment Setup

### 1. Vercel Environment Variables

**Required:** Set up the `NEXT_PUBLIC_APP_URL` environment variable in your Vercel project:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add a new environment variable:
   - **Key:** `NEXT_PUBLIC_APP_URL`
   - **Value:** `https://www.templeashkandi.com`
   - **Environments:** Check only "Production" ✅
   - **Preview/Development:** Leave unset (this allows the middleware to detect and block non-production domains)

### 2. Verify Code Changes

Ensure all files have been updated:

- ✅ `src/middleware.ts` - Added non-production domain blocking
- ✅ `src/app/layout.tsx` - Added metadataBase
- ✅ `src/app/(dashboard)/page.tsx` - Added canonical metadata
- ✅ `src/app/raids/page.tsx` - Added canonical metadata
- ✅ `src/app/raids/[raidId]/page.tsx` - Added canonical to generateMetadata
- ✅ `src/app/rare-recipes/page.tsx` - Added canonical metadata
- ✅ `src/server/metadata-helpers.ts` - Updated to use absolute URLs in Open Graph
- ✅ `src/env.js` - Added NEXT_PUBLIC_APP_URL
- ✅ `src/app/robots.ts` - Created dynamic robots.txt handler

## Post-Deployment Verification

### 1. Test robots.txt

**Production (should allow crawling):**

```bash
curl -H "Host: www.templeashkandi.com" https://www.templeashkandi.com/robots.txt
```

Expected: Should show production rules with sitemap

**Preview/Development (should block crawling):**

```bash
curl -H "Host: your-preview-url.vercel.app" https://your-preview-url.vercel.app/robots.txt
```

Expected: Should show `Disallow: /` for all paths

### 2. Test X-Robots-Tag Headers

**Production (should allow crawling):**

```bash
curl -I https://www.templeashkandi.com/
```

Expected: No `X-Robots-Tag` header (or only for private routes)

**Preview/Development (should block crawling):**

```bash
curl -I https://your-preview-url.vercel.app/
```

Expected: `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`

### 3. Verify Canonical URLs

Check that all pages have proper canonical URLs:

**Home page:**

```bash
curl https://www.templeashkandi.com/ | grep -i "canonical"
```

Expected: `<link rel="canonical" href="https://www.templeashkandi.com/" />`

**Raids page:**

```bash
curl https://www.templeashkandi.com/raids | grep -i "canonical"
```

Expected: `<link rel="canonical" href="https://www.templeashkandi.com/raids" />`

**Individual raid page:**

```bash
curl https://www.templeashkandi.com/raids/123 | grep -i "canonical"
```

Expected: `<link rel="canonical" href="https://www.templeashkandi.com/raids/123" />`

**Rare recipes page:**

```bash
curl https://www.templeashkandi.com/rare-recipes | grep -i "canonical"
```

Expected: `<link rel="canonical" href="https://www.templeashkandi.com/rare-recipes" />`

### 4. Test Open Graph URLs

Verify Open Graph URLs are absolute:

```bash
curl https://www.templeashkandi.com/raids/123 | grep -i "og:url"
```

Expected: `<meta property="og:url" content="https://www.templeashkandi.com/raids/123" />`

## Google Search Console Cleanup

### 1. Remove Incorrectly Indexed URLs

1. Go to **Google Search Console**
2. Navigate to **Indexing** → **Removals**
3. Click **New Request**
4. Add the incorrectly indexed Vercel preview URLs (one per line)
5. Select "Remove this URL and all pages with this prefix" for each Vercel preview domain
6. Submit the removal requests

### 2. Request Re-indexing

1. Go to **Google Search Console**
2. Navigate to **URL Inspection**
3. Test the following URLs:
   - `https://www.templeashkandi.com/`
   - `https://www.templeashkandi.com/raids`
   - `https://www.templeashkandi.com/rare-recipes`
4. For each URL, click **Request Indexing**

### 3. Submit Updated Sitemap

1. Go to **Google Search Console**
2. Navigate to **Sitemaps**
3. Submit: `https://www.templeashkandi.com/sitemap.xml`

## Monitoring

### 1. Check Coverage Report

After 1-2 weeks, check **Google Search Console** → **Coverage** to ensure:

- Vercel preview URLs are no longer indexed
- Production URLs are properly indexed
- No canonical URL errors

### 2. Monitor Search Results

Search for your site on Google to verify:

- Only production URLs appear in search results
- No Vercel preview URLs in search results
- Canonical URLs are working correctly

## Troubleshooting

### If Vercel previews are still being crawled:

1. Check that `NEXT_PUBLIC_APP_URL` is NOT set for Preview/Development environments
2. Verify middleware is working by checking response headers
3. Consider adding a `vercel.json` with additional header rules (optional)

### If canonical URLs aren't working:

1. Verify `NEXT_PUBLIC_APP_URL` is set correctly in production
2. Check that `metadataBase` is set in the root layout
3. Ensure all pages have `alternates.canonical` metadata

### If Google still shows errors:

1. Wait 1-2 weeks for Google to re-crawl
2. Use the URL Inspection tool to force re-indexing
3. Submit a new sitemap if needed
