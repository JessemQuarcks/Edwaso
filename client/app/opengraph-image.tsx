import { ImageResponse } from 'next/og';
import { getStoreInfo } from '@/lib/store';

// Default share card for pages without their own image (product pages use the product photo).
export const alt = 'Store';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const { storeName, storefront } = await getStoreInfo();
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #fbf3ec 0%, #f4e2d4 55%, #e9c9b1 100%)',
          color: '#171717',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 36, fontWeight: 600 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#171717', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
            {storeName.charAt(0)}
          </div>
          {storeName}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, maxWidth: 950 }}>{storefront.heroTitle}</div>
          {storefront.heroSubtitle && <div style={{ fontSize: 32, color: '#57534e', maxWidth: 900 }}>{storefront.heroSubtitle}</div>}
        </div>
      </div>
    ),
    size
  );
}
