import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiArrowLeft,
  FiMapPin,
  FiPhone,
  FiClock,
  FiPackage,
  FiNavigation,
  FiCheckCircle,
  FiUser,
  FiCamera,
  FiImage,
  FiAlertTriangle,
  FiTruck,
  FiZap,
  FiShoppingBag,
  FiChevronRight,
} from 'react-icons/fi';
const TrackingMap = lazy(() => import('../../../shared/components/TrackingMap'));
import PageTransition from '../../../shared/components/PageTransition';
import FixedBottomBar from '../components/FixedBottomBar';
import { formatPrice } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { useDeliveryTracking } from '../../../shared/hooks/useDeliveryTracking';
import socketService from '../../../shared/utils/socket';

const DeliveryReturnDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isLoaded } = useOutletContext();
  const {
    fetchReturnById,
    updateReturnStatus,
    pickupReturnFromCustomer,
    dropoffReturnAtVendor,
    resendReturnVendorOtp,
    deliveryBoy,
    returns
  } = useDeliveryAuthStore();

  const [returnReq, setReturnReq] = useState(null);
  const [pickupPhoto, setPickupPhoto] = useState(null);
  const [deliveryPhoto, setDeliveryPhoto] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendDebugOtp, setResendDebugOtp] = useState('');
  const [otp, setOtp] = useState('');

  // Multi-vendor state: track which vendor we're dropping off at
  const [activeVendorIdx, setActiveVendorIdx] = useState(0);

  const pickupInputRef = useRef(null);
  const pickupGalleryRef = useRef(null);
  const deliveryInputRef = useRef(null);
  const deliveryGalleryRef = useRef(null);

  const loadReturn = useCallback(async () => {
    try {
      const response = await fetchReturnById(id);
      setReturnReq(response || null);
      if (response?.pickupPhoto) setPickupPhoto(response.pickupPhoto);
      // For multi-vendor: auto-advance activeVendorIdx to first pending
      if (response?.isMultiVendor && Array.isArray(response?.vendorDropoffs)) {
        const firstPending = response.vendorDropoffs.findIndex(d => d.status !== 'dropped_off');
        setActiveVendorIdx(firstPending >= 0 ? firstPending : 0);
      }
    } catch (err) {
      toast.error('Failed to load return task details.');
      setReturnReq(null);
    }
  }, [id, fetchReturnById]);

  // Live Location Tracking
  const liveLocation = useDeliveryTracking(deliveryBoy?.id, returnReq ? [returnReq] : []);

  useEffect(() => {
    if (liveLocation) setCurrentLocation(liveLocation);
  }, [liveLocation]);

  useEffect(() => {
    loadReturn();
    const handleUpdate = () => loadReturn();
    socketService.on('return_status_updated', handleUpdate);
    if (id) socketService.joinRoom(`return_${id}`);
    return () => {
      socketService.off('return_status_updated');
    };
  }, [id, loadReturn]);

  const handleImage = (file, setter) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(reader.result);
    reader.readAsDataURL(file);
  };

  // ── Phase Detection ──
  // Phase logic:
  //   'customer_pickup'  → needs to pick up from customer
  //   'vendor_dropoff'   → single vendor drop-off
  //   'multi_vendor_dropoff' → multi-vendor drop-off (iterate vendorDropoffs)
  //   'completed'        → all done
  const getPhase = () => {
    if (!returnReq) return null;
    const rawStatus = returnReq.rawStatus || returnReq.status;
    if (rawStatus === 'completed') return 'completed';
    if (rawStatus === 'processing') {
      if (!returnReq.pickupPhoto) return 'customer_pickup';
      if (returnReq.isMultiVendor) return 'multi_vendor_dropoff';
      return 'vendor_dropoff';
    }
    return 'customer_pickup';
  };

  const currentPhase = getPhase();

  // ── Current active vendor for multi-vendor flow ──
  const vendorDropoffs = returnReq?.vendorDropoffs || [];
  const currentVendorDropoff = vendorDropoffs[activeVendorIdx] || null;
  const allDroppedOff = vendorDropoffs.length > 0 && vendorDropoffs.every(d => d.status === 'dropped_off');

  // ── Action Handlers ──
  const handleConfirmPickup = async () => {
    if (!pickupPhoto) return toast.error('Please capture a photo of the product picked up from the customer.');
    if (!otp || otp.length < 4) return toast.error('Please enter the 6-digit verification OTP.');
    setIsUpdating(true);
    try {
      let updated;
      // Use new endpoint if it's a try_buy return (has isMultiVendor or trySessionActive)
      if (returnReq.isMultiVendor || returnReq.trySessionActive) {
        updated = await pickupReturnFromCustomer(id, { otp, pickupPhoto });
      } else {
        updated = await updateReturnStatus(id, 'picked_up', { pickupPhoto, otp });
      }
      setReturnReq(updated);
      setPickupPhoto(updated?.pickupPhoto || pickupPhoto);
      setOtp('');
      toast.success('Pickup Recorded! Proceed to the Vendor(s).');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to record pickup');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmDropoff = async () => {
    if (!deliveryPhoto) return toast.error('Please capture a photo of the product handed over to the Vendor.');
    if (!otp || otp.length < 4) return toast.error('Please enter the 6-digit verification OTP.');
    setIsUpdating(true);
    try {
      let updated;
      if (returnReq.isMultiVendor && currentVendorDropoff) {
        updated = await dropoffReturnAtVendor(id, {
          vendorId: String(currentVendorDropoff.vendorId?._id || currentVendorDropoff.vendorId),
          otp,
          deliveryPhoto,
        });
        // Advance to next pending vendor
        const nextIdx = (updated?.vendorDropoffs || []).findIndex(d => d.status !== 'dropped_off');
        if (nextIdx >= 0) {
          setActiveVendorIdx(nextIdx);
          toast.success(`✅ Drop-off at ${currentVendorDropoff.vendorName} done! Proceed to next vendor.`);
        } else {
          toast.success('🎉 All vendors covered! Return mission complete.');
          navigate('/delivery/dashboard');
        }
      } else {
        updated = await updateReturnStatus(id, 'completed', { deliveryPhoto, otp });
        toast.success('Return Completed Successfully!');
        navigate('/delivery/dashboard');
      }
      setReturnReq(updated);
      setDeliveryPhoto(null);
      setOtp('');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to record delivery');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResendOtp = async () => {
    setIsResending(true);
    try {
      const vendorIdToUse = currentPhase === 'multi_vendor_dropoff' 
        ? (currentVendorDropoff?.vendorId?._id || currentVendorDropoff?.vendorId) 
        : undefined;
      const res = await resendReturnVendorOtp(id, vendorIdToUse ? String(vendorIdToUse) : undefined);
      if (res?.otpDebug) {
        setResendDebugOtp(res.otpDebug);
      }
      toast.success('Vendor OTP has been resent successfully.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to resend OTP');
    } finally {
      setIsResending(false);
    }
  };

  if (!returnReq) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-slate-100 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Target Location for Map ──
  const customerCoords = returnReq.orderId?.dropoffLocation?.coordinates;
  const activeVendorCoords = currentVendorDropoff?.shopLocation?.coordinates ||
    returnReq.vendorId?.shopLocation?.coordinates;

  const targetCoords = currentPhase === 'customer_pickup'
    ? (Array.isArray(customerCoords) && customerCoords.length === 2 ? { lat: customerCoords[1], lng: customerCoords[0] } : null)
    : (Array.isArray(activeVendorCoords) && activeVendorCoords.length === 2 ? { lat: activeVendorCoords[1], lng: activeVendorCoords[0] } : null);

  const targetAddress = currentPhase === 'customer_pickup'
    ? returnReq.address
    : (currentVendorDropoff?.shopAddress || returnReq.vendorAddress);

  const targetName = currentPhase === 'customer_pickup'
    ? returnReq.customer
    : (currentVendorDropoff?.vendorName || returnReq.vendorName);

  const targetPhone = currentPhase === 'customer_pickup'
    ? returnReq.phone
    : (currentVendorDropoff?.vendorPhone || returnReq.vendorId?.phone);

  // Items for current context
  const displayItems = (currentPhase === 'multi_vendor_dropoff' && currentVendorDropoff)
    ? (currentVendorDropoff.items || [])
    : (returnReq.items || []);

  // Display debug OTP for the current context (customer pickup or vendor dropoff)
  const displayOtpDebug = resendDebugOtp || (currentPhase === 'customer_pickup' ? returnReq.pickupOtpDebug : (currentPhase === 'multi_vendor_dropoff' ? currentVendorDropoff?.dropoffOtpDebug : returnReq.deliveryOtpDebug));

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-50 pb-32 relative font-sans">
        {/* Floating Header */}
        <header className="sticky top-0 left-0 right-0 z-50 px-4 py-4 flex items-center gap-3 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm">
          <button onClick={() => navigate(-1)} className="p-2 bg-white shadow-sm rounded-lg shrink-0 border border-slate-100">
            <FiArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-black text-slate-900 leading-tight mb-0.5">
              Return #{String(returnReq.returnId || returnReq.id).toUpperCase().slice(-8)}
            </h2>
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-[8.5px] font-black border border-indigo-100 uppercase tracking-tighter">
                {currentPhase === 'customer_pickup' ? 'PICKUP' : currentPhase === 'completed' ? 'DONE' : 'DROP-OFF'}
              </span>
              {returnReq.isMultiVendor && (
                <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-[8.5px] font-black border border-amber-100 uppercase tracking-tighter">
                  MULTI-VENDOR
                </span>
              )}
            </div>
          </div>
          <a
            href={`tel:${targetPhone}`}
            className="w-9 h-9 bg-indigo-600/90 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200/50 shrink-0"
          >
            <FiPhone size={18} />
          </a>
        </header>

        <div className="max-w-md mx-auto pt-4">
          {/* Map Layer */}
          {targetCoords && (
            <div className="w-full h-[400px] bg-white relative">
              <Suspense fallback={
                <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-2xl">
                  <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              }>
                <TrackingMap
                  deliveryLocation={currentLocation}
                  vendorLocation={activeVendorCoords ? { lat: activeVendorCoords[1], lng: activeVendorCoords[0] } : null}
                  customerLocation={customerCoords ? { lat: customerCoords[1], lng: customerCoords[0] } : null}
                  status={currentPhase === 'customer_pickup' ? 'ready_for_pickup' : 'picked_up'}
                  customerAddress={returnReq.address}
                  vendorAddress={targetAddress}
                  followMode={true}
                  isLoaded={isLoaded}
                  type="return"
                />
              </Suspense>
              <button
                onClick={() => {
                  const dest = targetCoords ? `${targetCoords.lat},${targetCoords.lng}` : encodeURIComponent(targetAddress);
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
                    '_blank'
                  );
                }}
                className="absolute bottom-6 right-4 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 font-black text-xs uppercase tracking-widest active:scale-95 transition-all z-10"
              >
                <FiNavigation size={18} /> Navigation
              </button>
            </div>
          )}

          <div className="p-4 space-y-4">
            {/* Multi-vendor Route Progress */}
            {returnReq.isMultiVendor && vendorDropoffs.length > 0 && currentPhase !== 'customer_pickup' && (
              <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm">
                <p className="text-[9px] font-bold text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <FiShoppingBag size={11} /> Vendor Route ({vendorDropoffs.filter(d => d.status === 'dropped_off').length}/{vendorDropoffs.length} Done)
                </p>
                <div className="space-y-2">
                  {vendorDropoffs.map((dropoff, idx) => {
                    const isDone = dropoff.status === 'dropped_off';
                    const isActive = idx === activeVendorIdx && !isDone;
                    return (
                      <div key={idx} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${isDone ? 'bg-emerald-50 border-emerald-200' : isActive ? 'bg-indigo-50 border-indigo-300 shadow-sm' : 'bg-slate-50 border-slate-100'}`}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black ${isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-200 text-slate-400'}`}>
                          {isDone ? '✓' : idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] font-black leading-tight truncate ${isDone ? 'text-emerald-700' : isActive ? 'text-indigo-700' : 'text-slate-400'}`}>
                            {dropoff.vendorName}
                          </p>
                          <p className="text-[9px] text-slate-400 font-medium truncate">{dropoff.shopAddress}</p>
                        </div>
                        {isDone && <FiCheckCircle size={14} className="text-emerald-500 shrink-0" />}
                        {isActive && <FiChevronRight size={14} className="text-indigo-500 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Address & Target Breakdown */}
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                    {currentPhase === 'customer_pickup' ? 'PICKUP FROM' : 'DELIVER TO'}
                  </p>
                  <h3 className="text-base font-bold text-slate-800 leading-tight">
                    {targetName}
                  </h3>
                  <div className="flex items-start gap-1.5 mt-2 text-slate-500">
                    <FiMapPin className="shrink-0 mt-0.5" size={12} />
                    <p className="text-[11px] font-medium leading-relaxed">
                      {targetAddress}
                    </p>
                  </div>
                  {targetPhone && (
                    <div className="flex items-center gap-1.5 mt-1 text-slate-500">
                      <FiPhone className="shrink-0" size={11} />
                      <p className="text-[11px] font-medium leading-relaxed">
                        {targetPhone}
                      </p>
                    </div>
                  )}
                </div>
                <div className="w-10 h-10 bg-slate-50 text-indigo-600 rounded-2xl flex items-center justify-center border border-slate-100 shrink-0">
                  {currentPhase === 'customer_pickup' ? <FiUser size={20} /> : <FiPackage size={20} />}
                </div>
              </div>

              {/* Items in Return */}
              <div className="border-t border-slate-50 pt-4 mt-1">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-bold text-slate-800 uppercase tracking-widest leading-none">
                    {currentPhase === 'multi_vendor_dropoff' ? `ITEMS FOR ${currentVendorDropoff?.vendorName?.toUpperCase()}` : `MANIFEST (${displayItems.length})`}
                  </p>
                  <p className="text-xs font-bold text-indigo-600">
                    {formatPrice(returnReq.refundAmount || 0)}
                  </p>
                </div>
                <div className="space-y-2">
                  {displayItems.map((item, idx) => (
                    <div key={idx} className="flex gap-3 p-2 rounded-xl border border-slate-50 bg-slate-50">
                      <div className="w-10 h-10 bg-white rounded-lg overflow-hidden border border-slate-100 shrink-0 flex items-center justify-center">
                        {item.image ? (
                          <img src={item.image} className="w-full h-full object-cover" />
                        ) : (
                          <FiPackage className="text-slate-300" size={16} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <p className="text-[11px] font-bold text-slate-800 leading-tight truncate">
                          {item.name}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 mt-0.5 uppercase tracking-tighter">
                          Qty: {item.quantity || 1} • {formatPrice(item.price || 0)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ACTION CENTER */}
            {currentPhase !== 'completed' && (
              <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[9px] font-bold text-slate-800 uppercase tracking-widest">
                      Verification Photo
                    </p>
                    <span className="text-[8px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded leading-none uppercase">
                      {currentPhase === 'customer_pickup' ? 'PICKUP' : 'HANDOVER'}
                    </span>
                  </div>

                  {/* Photo Trigger */}
                  <div className="relative aspect-[16/9] bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 flex items-center justify-center group shadow-inner">
                    {(currentPhase === 'customer_pickup' ? pickupPhoto : deliveryPhoto) ? (
                      <>
                        <img
                          src={currentPhase === 'customer_pickup' ? pickupPhoto : deliveryPhoto}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => (currentPhase === 'customer_pickup' ? setPickupPhoto(null) : setDeliveryPhoto(null))}
                          className="absolute top-2 right-2 w-7 h-7 bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-md shadow-lg text-sm leading-none"
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <button
                          onClick={() =>
                            currentPhase === 'customer_pickup'
                              ? pickupInputRef.current.click()
                              : deliveryInputRef.current.click()
                          }
                          className="flex flex-col items-center gap-1.5 text-indigo-600 active:scale-95 transition-transform"
                        >
                          <FiCamera size={28} />
                          <span className="text-[9px] font-black uppercase tracking-tight">CAMERA</span>
                        </button>
                        <div className="w-12 h-[1px] bg-slate-200" />
                        <button
                          onClick={() =>
                            currentPhase === 'customer_pickup'
                              ? pickupGalleryRef.current.click()
                              : deliveryGalleryRef.current.click()
                          }
                          className="flex flex-col items-center gap-1.5 text-slate-400 active:scale-95 transition-transform"
                        >
                          <FiImage size={24} />
                          <span className="text-[8px] font-black uppercase tracking-tight">GALLERY</span>
                        </button>
                      </div>
                    )}

                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      ref={currentPhase === 'customer_pickup' ? pickupInputRef : deliveryInputRef}
                      onChange={(e) =>
                        handleImage(
                          e.target.files[0],
                          currentPhase === 'customer_pickup' ? setPickupPhoto : setDeliveryPhoto
                        )
                      }
                      className="hidden"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      ref={currentPhase === 'customer_pickup' ? pickupGalleryRef : deliveryGalleryRef}
                      onChange={(e) =>
                        handleImage(
                          e.target.files[0],
                          currentPhase === 'customer_pickup' ? setPickupPhoto : setDeliveryPhoto
                        )
                      }
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM FIXED BUTTON & OTP */}
        <FixedBottomBar className="p-3 bg-white/95 backdrop-blur-md border-t border-slate-100 z-50 flex flex-col gap-2">
          {['customer_pickup', 'vendor_dropoff', 'multi_vendor_dropoff'].includes(currentPhase) && (
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={currentPhase === 'customer_pickup' ? "ENTER CUSTOMER PICKUP OTP" : "ENTER VENDOR HANDOVER OTP"}
                  className="w-full h-12 px-4 text-center text-sm font-bold tracking-[0.2em] bg-white border-2 border-slate-200 rounded-2xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all placeholder:text-slate-400 placeholder:text-[12px] placeholder:tracking-wide placeholder:font-semibold"
                />
              </div>
              
              {currentPhase !== 'customer_pickup' && (
                <button
                  onClick={handleResendOtp}
                  disabled={isResending}
                  className="self-end text-[10px] font-bold text-indigo-600 uppercase tracking-wider disabled:opacity-50 pr-2"
                >
                  {isResending ? 'RESENDING...' : 'RESEND OTP'}
                </button>
              )}
            </div>
          )}

          {currentPhase === 'customer_pickup' && (
            <button
              onClick={handleConfirmPickup}
              disabled={isUpdating || !pickupPhoto}
              className="w-full h-12 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all disabled:opacity-20"
            >
              {isUpdating ? 'SAVING...' : 'CONFIRM CUSTOMER PICKUP'}
            </button>
          )}

          {(currentPhase === 'vendor_dropoff' || currentPhase === 'multi_vendor_dropoff') && !allDroppedOff && (
            <button
              onClick={handleConfirmDropoff}
              disabled={isUpdating || !deliveryPhoto}
              className="w-full h-12 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all disabled:opacity-20"
            >
              {isUpdating
                ? 'SAVING...'
                : currentPhase === 'multi_vendor_dropoff'
                  ? `CONFIRM DROP-OFF AT ${(currentVendorDropoff?.vendorName || 'VENDOR').toUpperCase()}`
                  : 'CONFIRM VENDOR HANDOVER'}
            </button>
          )}

          {currentPhase === 'completed' && (
            <div className="text-center py-2 bg-emerald-50 border border-emerald-100 rounded-xl">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-0.5">
                RETURN MISSION COMPLETED
              </p>
              <p className="text-[8px] font-bold text-emerald-400 uppercase leading-none">
                Handover records saved safely.
              </p>
            </div>
          )}
        </FixedBottomBar>
      </div>
    </PageTransition>
  );
};

export default DeliveryReturnDetail;
