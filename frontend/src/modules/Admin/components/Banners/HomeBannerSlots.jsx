import { useEffect, useState } from 'react';
import { FiUpload, FiSave, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { getHomeBanners, saveHomeBanner, deleteHomeBanner, uploadAdminImage } from '../../services/adminService';

const SLOTS = [
  { key: 'bottom', label: 'Home page banner', hint: 'Shows in the middle of the home page, between Brand Bestsellers and For Him.' },
];

const empty = { image: '', mobileImage: '', title: '', subtitle: '', badge: '', ctaText: '', link: '', isActive: true };

const Slot = ({ slot, initial, onChanged }) => {
  const [form, setForm] = useState({ ...empty, ...initial });
  const [busy, setBusy] = useState(false);
  const saved = !!initial?.image;

  // Reset only when this slot's saved record really changes; a reload (or saving
  // the other slot) hands back new objects and must not wipe unsaved edits here.
  const savedVersion = initial?.updatedAt || null;
  useEffect(() => { setForm({ ...empty, ...initial }); }, [savedVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const upload = async (e, field) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type?.startsWith('image/')) { toast.error('Please select a valid image file'); return; }
    setBusy(true);
    try {
      const res = await uploadAdminImage(file, 'banners');
      const url = res?.data?.url;
      if (url) set({ [field]: url }); else toast.error('Image upload failed');
    } catch { /* toast shown by api client */ } finally { setBusy(false); }
  };

  const save = async () => {
    if (!form.image) { toast.error('Upload the banner image first'); return; }
    setBusy(true);
    try {
      await saveHomeBanner(slot.key, form);
      toast.success(`${slot.label} saved`);
      onChanged();
    } catch { /* toast shown by api client */ } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Remove the ${slot.label.toLowerCase()}?`)) return;
    setBusy(true);
    try {
      await deleteHomeBanner(slot.key);
      toast.success(`${slot.label} removed`);
      onChanged();
    } catch { /* toast shown by api client */ } finally { setBusy(false); }
  };

  const picker = (field, text) => (
    <label className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
      <FiUpload /> {text}
      <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => upload(e, field)} />
    </label>
  );

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-gray-900">{slot.label}</h3>
        <p className="text-xs text-gray-500">{slot.hint}</p>
      </div>
      {form.image ? (
        <img src={form.image} alt="" className="w-full max-h-48 object-cover rounded-lg border border-gray-100" />
      ) : (
        <div className="w-full h-28 rounded-lg bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center text-sm text-gray-400">No image yet</div>
      )}
      <div className="flex flex-wrap gap-2">
        {picker('image', form.image ? 'Change image' : 'Upload image')}
        {picker('mobileImage', form.mobileImage ? 'Change mobile image' : 'Mobile image (optional)')}
      </div>
      <input
        value={form.link}
        onChange={(e) => set({ link: e.target.value })}
        placeholder="Link opened on tap / button (e.g. /sale/diwali or https://...)"
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <input
        value={form.title}
        onChange={(e) => set({ title: e.target.value })}
        placeholder="Title shown on the banner (e.g. The SS24 Collection) - optional"
        maxLength={80}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <input
        value={form.subtitle}
        onChange={(e) => set({ subtitle: e.target.value })}
        placeholder="Subtitle (desktop only) - optional"
        maxLength={160}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={form.badge}
          onChange={(e) => set({ badge: e.target.value })}
          placeholder="Badge (e.g. New) - optional"
          maxLength={20}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <input
          value={form.ctaText}
          onChange={(e) => set({ ctaText: e.target.value })}
          placeholder="Button text (e.g. Shop Now) - optional"
          maxLength={24}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
        Show on home page
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-black rounded-lg disabled:opacity-50">
          <FiSave /> Save
        </button>
        {saved && (
          <button type="button" onClick={remove} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg disabled:opacity-50">
            <FiTrash2 /> Remove
          </button>
        )}
      </div>
    </div>
  );
};

// Admin > Banners > Home Page Banner: the single banner shown mid-page on the storefront.
const HomeBannerSlots = () => {
  const [data, setData] = useState({});

  const load = () => getHomeBanners().then((res) => setData(res?.data || {})).catch(() => {});
  useEffect(() => { load(); }, []);

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Home Page Banner</h2>
        <p className="text-sm text-gray-500">One banner shown in the middle of the home page. Position and on/off can also be set in Content &amp; Features &gt; Home Page.</p>
      </div>
      <div className="grid gap-4 max-w-xl">
        {SLOTS.map((s) => <Slot key={s.key} slot={s} initial={data[s.key]} onChanged={load} />)}
      </div>
    </div>
  );
};

export default HomeBannerSlots;
