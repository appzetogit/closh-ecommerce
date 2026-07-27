import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'; // stable imports
import api from '../../../shared/utils/api';
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
  FiShield,
  FiCreditCard,
  FiSend,
  FiX,
  FiMaximize,
  FiImage,
  FiPlus,
  FiZap,
  FiAlertTriangle
} from 'react-icons/fi';
import { requestCameraPermission } from '@shared/utils/permissionHelper';
import { compressImage } from '@shared/utils/imageHelper';
import CancellationModal from '../components/CancellationModal';
import TrackingMap from '../../../shared/components/TrackingMap';
import PageTransition from '../../../shared/components/PageTransition';
import { formatPrice } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { useDeliveryTracking } from '../../../shared/hooks/useDeliveryTracking';
import socketService from '../../../shared/utils/socket';
import CustomerRatingCard from '../components/CustomerRatingCard';

const DeliveryOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isLoaded } = useOutletContext();
  const {
    fetchOrderById,
    resendDeliveryOtp,
    isLoadingOrder,
    isUpdatingOrderStatus,
    updateOrderStatus,
    markArrivedAtCustomer,
    submitTryAndBuy,
    setPaymentMethod,
    completeDeliveryFlow,
    cancelOrder,
    deliveryBoy,
    orders,
    acceptReturn,
    acceptOrder,
    rejectOrder,
    markArrivedAtVendor,
  } = useDeliveryAuthStore();

  const [order, setOrder] = useState(null);
  const [otpValue, setOtpValue] = useState('');
  const [deliveryPhoto, setDeliveryPhoto] = useState(null);
  const [openBoxPhoto, setOpenBoxPhoto] = useState(null);
  const [pickupPhoto, setPickupPhoto] = useState(null);
  // Multi-photo support: extra photos beyond the first
  const [extraPickupPhotos, setExtraPickupPhotos] = useState([]);
  const [extraDeliveryPhotos, setExtraDeliveryPhotos] = useState([]);
  const [hasArrived, setHasArrived] = useState(false);
  const [hasArrivedAtVendor, setHasArrivedAtVendor] = useState(false);

  const [cancellationReasons, setCancellationReasons] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [paymentSelection, setPaymentSelection] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrUrl, setQrUrl] = useState(null);
  const [isVerifyingQR, setIsVerifyingQR] = useState(false);
  const [isCancellationModalOpen, setIsCancellationModalOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null); // 'pickup', 'delivery', 'openBox'

  const pickupInputRef = useRef(null);
  const pickupGalleryRef = useRef(null);
  const deliveryInputRef = useRef(null);
  const deliveryGalleryRef = useRef(null);
  const openBoxInputRef = useRef(null);
  const openBoxGalleryRef = useRef(null);

  // Webcam state for desktop camera capture
  const [showWebcam, setShowWebcam] = useState(false);
  const [webcamTarget, setWebcamTarget] = useState(null);
  const webcamVideoRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const webcamCanvasRef = useRef(null);

  const isReturn = order?.type === 'return';
  const isCod = order?.paymentMethod === 'cod' || order?.paymentMethod === 'cash';
  // Derived type flags from orderType string
  const isCheckAndBuy = order?.orderType === 'check_and_buy';
  const isTryAndBuy = order?.orderType === 'try_and_buy';
  // Whether order needs multiple photos (qty > 1 or multiple items)
  const totalQty = (order?.items || []).reduce((s, i) => s + (Number(i.quantity) || 1), 0);
  const needsMultiPhoto = totalQty > 1;

  const getPhase = () => {
    if (!order) return null;
    const s = String(order.status || '').toLowerCase().replace(/_/g, ' ');
    const rawS = String(order.rawStatus || order.status || '').toLowerCase().replace(/_/g, ' ');

    // Pickup phase includes newly available, assigned, or accepted orders
    if (['pending', 'ready for pickup', 'ready_for_pickup', 'assigned', 'accepted'].includes(s) ||
      ['ready for pickup', 'ready_for_pickup', 'assigned', 'accepted'].includes(rawS)) return 'pickup';

    // Delivery phase includes anything picked up or out for delivery
    // 'processing' is the active try/check-and-buy session status (after arrival)
    // 'return_requested' / 'arrived' can appear when return is pending on a delivered order
    if (['picked-up', 'picked_up', 'picked up', 'out-for-delivery', 'out_for_delivery', 'out for delivery', 'shipped', 'processing', 'arrived', 'return_requested', 'return requested', 'awaiting_return', 'awaiting return'].includes(s) ||
      ['picked_up', 'picked up', 'out_for_delivery', 'out for delivery', 'processing', 'arrived', 'return_requested', 'return requested'].includes(rawS)) return 'delivery';

    if (['returning_unselected_items', 'returning_unselected', 'returning unselected items', 'returning unselected'].includes(s) || 
      ['returning_unselected_items', 'returning_unselected', 'returning unselected items', 'returning unselected'].includes(rawS)) return 'returning_unselected';

    return null;
  };

  const currentPhase = getPhase();
  const liveLocation = useDeliveryTracking(deliveryBoy?.id, order ? [order] : []);

  // Check if this order is actually assigned to the current rider
  const isAssignedToMe = order && (
    (typeof order.deliveryBoyId === 'string' && order.deliveryBoyId === deliveryBoy?.id) ||
    (order.deliveryBoyId?._id === deliveryBoy?.id) ||
    (order.deliveryBoyId === deliveryBoy?._id)
  );

  const availableStatuses = ['ready_for_pickup', 'pending', 'approved', 'searching', 'all_vendors_ready'];
  const isAvailableTask = order && !order.deliveryBoyId && (availableStatuses.includes(order.rawStatus) || availableStatuses.includes(order.status));

  const isOrderFinished = ['delivered', 'returned', 'returned_to_vendor', 'cancelled', 'canceled', 'return_requested', 'return_approved', 'awaiting_return'].includes(order?.status?.toLowerCase());


  const hasActiveTask = (orders || []).some(o =>
    ['assigned', 'picked_up', 'out_for_delivery', 'arrived', 'processing'].includes(o.status?.toLowerCase()) ||
    ['accepted', 'picked-up', 'out-for-delivery'].includes(o.status?.toLowerCase()) ||
    o.rawStatus === 'processing'
  );

  useEffect(() => {
    if (liveLocation) setCurrentLocation(liveLocation);
  }, [liveLocation]);

  const loadOrder = useCallback(async () => {
    const fetchReasons = async () => {
      try {
        const reasonsRes = await api.get('/delivery/cancellation-reasons');
        if (reasonsRes?.success) {
          setCancellationReasons(reasonsRes.data || []);
        }
      } catch (e) {
        console.error('Failed to fetch cancellation reasons', e);
      }
    };
    fetchReasons();

    try {
      const response = await fetchOrderById(id);
      if (response?.isMultiVendor && response?.type !== 'return') {
        const s = String(response.status || '').toLowerCase();
        const rawS = String(response.rawStatus || '').toLowerCase();
        const isPickupPhase = ['pending', 'ready_for_pickup', 'assigned', 'accepted'].includes(s) || ['pending', 'ready_for_pickup', 'assigned', 'accepted'].includes(rawS);
        
        if (isPickupPhase) {
          navigate(`/delivery/multi-vendor/${id}`, { replace: true });
          return;
        }
      }
      // If this order is actually a return, redirect to the correct return detail page
      if (response?.type === 'return') {
        navigate(`/delivery/returns/${id}`, { replace: true });
        return;
      }
      // If this order has an active return request, redirect to the return request detail page
      if (response?.returnRequest) {
        navigate(`/delivery/returns/${response.returnRequest._id || response.returnRequest.id}`, { replace: true });
        return;
      }
      setOrder(response || null);

      // Detect arrival from multiple signals:
      // 1. Legacy arrivedAt on order root
      // 2. deliveryFlow.arrivedAt (Antigravity engine)
      // 3. deliveryFlow.phase being 'arrived', 'try_and_buy', 'payment_pending', or later
      // 4. deliveryFlow.otpSentAt (OTP was generated = rider arrived)
      const arrivedPhases = ['arrived', 'try_and_buy', 'payment_pending', 'delivered'];
      const hasArrivedSignal = !!(
        response?.arrivedAt ||
        response?.deliveryFlow?.arrivedAt ||
        arrivedPhases.includes(response?.deliveryFlow?.phase) ||
        response?.deliveryFlow?.otpSentAt
      );

      if (hasArrivedSignal) {
        setHasArrived(true);
        const accepted = (response.deliveryFlow?.tryAndBuyItems || response.items || [])
          .map((i, idx) => i.decision !== 'rejected' ? idx : -1)
          .filter(idx => idx !== -1);
        setSelectedItemIds(new Set(accepted));
        setPaymentSelection(response.deliveryFlow?.paymentMethod || null);
      }
      // Restore pickup photo from backend for check-and-buy / try-and-buy orders
      if (response?.deliveryFlow?.pickupProofPhoto) {
        setPickupPhoto(response.deliveryFlow.pickupProofPhoto.split('|||')[0]);
      }
      if (response?.deliveryFlow?.arrivedAtVendor) {
        setHasArrivedAtVendor(true);
      } else if (response?.items) {
        setSelectedItemIds(new Set(response.items.map((_, idx) => idx)));
      }
    } catch (err) {
      setOrder(null);
    }
  }, [id, fetchOrderById]);


  useEffect(() => {
    loadOrder();
    const handleUpdate = () => loadOrder();
    socketService.on('order_status_updated', handleUpdate);
    socketService.on('order_taken', (data) => {
      if (data.id === id || data.orderId === id) {
        toast.error('Mission taken by another partner');
        navigate('/delivery/dashboard');
      }
    });

    if (id) socketService.joinRoom(`order_${id}`);
    return () => {
      socketService.off('order_status_updated');
      socketService.off('order_taken');
    };
  }, [id, loadOrder, navigate]);

  // Prevent accidental browser back on available tasks
  useEffect(() => {
    if (!isAvailableTask) return;
    
    // Push a dummy state so back button triggers popstate instead of leaving
    window.history.pushState({ orderGuard: true }, '');
    
    const handlePopState = (e) => {
      if (isAvailableTask) {
        const confirmed = window.confirm('⚠️ Kya aap wapas jaana chahte hain? Agar aapne order accept nahi kiya toh ye kisi aur ko assign ho jayega!');
        if (!confirmed) {
          // Re-push state to keep the guard active
          window.history.pushState({ orderGuard: true }, '');
        } else {
          navigate('/delivery/dashboard');
        }
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isAvailableTask, navigate]);

  const handleAcceptMission = async () => {
    if (hasActiveTask) {
      return toast.error('You must complete your current task first!');
    }
    try {
      // Use stable id from useParams
      let updated;
      if (order?.type === 'return') {
        updated = await acceptReturn(id);
      } else {
        updated = await acceptOrder(id);
      }
      setOrder(updated);
      toast.success('MISSION ACCEPTED! GET STARTED');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to accept mission');
      navigate('/delivery/dashboard');
    }
  };

  const handleRejectMission = async () => {
    const confirmed = window.confirm('Are you sure you want to decline this order? It will be reassigned to another delivery partner.');
    if (!confirmed) return;
    try {
      if (order?.type === 'return') {
        await rejectOrder(id);
      } else {
        await rejectOrder(id);
      }
      toast.success('Mission declined');
      navigate('/delivery/dashboard');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to decline mission');
    }
  };

  const handleUpdateStatus = async (status, msg, options = {}) => {
    try {
      // Use stable id from useParams
      const updated = await updateOrderStatus(id, status, options);
      setOrder(updated);
      toast.success(msg);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Update failed');
    }
  };

  const handleArrival = async () => {
    if (!id) return;
    try {
      // Use stable id from useParams
      const updated = await markArrivedAtCustomer(id);
      setOrder(updated);
      setHasArrived(true);
      toast.success('Arrival marked. OTP sent.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to mark arrival');
    }
  };

  const handleReachedVendor = async () => {
    if (!id) return;
    try {
      const updated = await markArrivedAtVendor(id);
      setOrder(updated);
      setHasArrivedAtVendor(true);
      toast.success('Vendor notified of your arrival!');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to mark arrival at vendor');
    }
  };

  const handleOtpResend = async () => {
    if (isResending || !id) return;
    try {
      setIsResending(true);
      await resendDeliveryOtp(id);
      toast.success('OTP sent to customer');
    } catch {
      toast.error('Failed to resend OTP');
    } finally {
      setIsResending(false);
    }
  };

  const toggleItem = (idx) => {
    if (!isTryAndBuy) return;
    const next = new Set(selectedItemIds);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedItemIds(next);
  };

  const handleItemConfirmation = async () => {
    if (selectedItemIds.size === 0) {
      if (!window.confirm("Customer rejected all items. Only delivery fees will be collected. Proceed?")) {
        return;
      }
    }
    try {
      const items = order.items.map((it, idx) => ({
        productId: it.productId || it._id,
        decision: selectedItemIds.has(idx) ? 'accepted' : 'rejected'
      }));
      // Use stable id from useParams
      const updated = await submitTryAndBuy(id, items);
      setOrder(updated);
      toast.success('Items selection confirmed');
    } catch {
      toast.error('Failed to confirm selection');
    }
  };

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const handlePaymentMethod = async (method) => {
    try {
      // Use stable id from useParams
      const res = await setPaymentMethod(id, method);
      const updatedOrder = res.order || res;
      setOrder(updatedOrder);
      setPaymentSelection(method);

      if (method === 'qr') {
        if (res.qrUrl) {
          setQrUrl(res.qrUrl);
          setShowQRModal(true);
        } else {
          toast.error('Failed to generate QR Code.');
        }
      } else {
        toast.success(`Method: ${method.toUpperCase()}`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to update payment');
    }
  };

  const calculatedTotal = order?.deliveryFlow?.finalAmount || order?.total || 0;

  const handleVerifyQRPayment = async () => {
    setIsVerifyingQR(true);
    const toastId = toast.loading('Verifying payment with Razorpay...');
    try {
        const { verifyQrPayment } = useDeliveryAuthStore.getState();
        await verifyQrPayment(id);
        toast.success('Payment Verified!', { id: toastId });
        setShowQRModal(false);
        await loadOrder();
    } catch (err) {
        toast.error(err?.response?.data?.message || 'Payment not completed yet.', { id: toastId });
    } finally {
        setIsVerifyingQR(false);
    }
  };

  const handleCancelOrder = () => {
    setIsCancellationModalOpen(true);
  };

  const confirmCancellation = async (reasonData) => {
    setIsCancelling(true);
    try {
      const updated = await cancelOrder(id, reasonData);
      setOrder(updated);
      toast.success('Cancellation request submitted to admin');
      setIsCancellationModalOpen(false);
      navigate('/delivery/dashboard');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Cancellation request failed');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleFinalize = async () => {
    if (!/^\d{6}$/.test(otpValue.trim())) return toast.error('Enter 6-digit OTP');
    if (isCod && !paymentSelection) return toast.error('Select payment method');
    if (!deliveryPhoto) return toast.error('Delivery photo required');
    if (isCod && !openBoxPhoto) return toast.error('Open box photo required');

    // Combine all delivery photos
    const allDeliveryPhotos = [deliveryPhoto, ...extraDeliveryPhotos].filter(Boolean);
    const deliveryProofPhoto = allDeliveryPhotos.length > 1
      ? allDeliveryPhotos.join('|||') // delimiter the backend can split on
      : allDeliveryPhotos[0];

    try {
      // Use stable id from useParams
      const allPickupPhotos = [pickupPhoto, ...extraPickupPhotos].filter(Boolean);
      const pickupProofPhoto = allPickupPhotos.length > 1
        ? allPickupPhotos.join('|||')
        : allPickupPhotos[0];
      const { order: updated, returnTask } = await completeDeliveryFlow(id, {
        otp: otpValue.trim(),
        openBoxPhoto,
        deliveryProofPhoto
      });
      setOrder(updated);
      
      const newStatus = String(updated.status || '').toLowerCase();
      if (returnTask) {
        toast.success("Delivery done. Return task assigned!");
        navigate(`/delivery/returns/${returnTask.id}`);
      } else if (newStatus === 'returning_unselected_items' || newStatus === 'returning_unselected') {
        toast.success('Items delivered. Now please return the unselected items to the vendor.');
      } else {
        setShowSuccess(true);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Delivery failed');
    }
  };

  const [vendorReturnOtps, setVendorReturnOtps] = useState({});

  const handleArriveVendorReturn = async (vendorId) => {
    try {
      const res = await api.post(`/delivery/orders/${id}/vendor-returns/${vendorId}/arrive`);
      await loadOrder();
      toast.success(res?.message || res?.data?.message || 'Arrived at vendor');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to mark arrival');
    }
  };

  const handleResendVendorReturnOtp = async (vendorId) => {
    try {
      const res = await api.post(`/delivery/orders/${id}/vendor-returns/${vendorId}/resend-otp`);
      toast.success(res?.message || res?.data?.message || 'OTP Resent');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to resend OTP');
    }
  };

  const handleVerifyVendorReturnOtp = async (vendorId) => {
    const otp = vendorReturnOtps[vendorId];
    if (!otp) return toast.error('Please enter OTP');
    
    try {
      const res = await api.post(`/delivery/orders/${id}/vendor-returns/${vendorId}/verify-otp`, { otp });
      await loadOrder();
      toast.success(res?.message || res?.data?.message || 'OTP verified');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to verify OTP');
    }
  };

  const handleCompleteVendorReturn = async (vendorId) => {
      try {
          const res = await api.post(`/delivery/orders/${id}/vendor-returns/${vendorId}/complete`);
          await loadOrder();
          toast.success(res?.message || res?.data?.message || 'Returned items to vendor');
          
          // Use the raw status from the backend to check if the try_buy phase is totally complete
          const backendStatus = res?.data?.status || res?.data?.order?.status || res?.status;
          if (backendStatus === 'try_buy_completed') {
              setShowSuccess(true);
          }
      } catch (err) {
          toast.error(err?.response?.data?.message || 'Failed to mark return');
      }
  };

  // handleImage: set primary photo with compression
  const handleImage = async (file, setter) => {
    if (!file) return;

    const toastId = toast.loading("Processing photo...");
    try {
      // Use our new compression utility
      const compressed = await compressImage(file, { maxWidth: 1280, quality: 0.8 });
      setter(compressed);
      toast.success("Photo captured!", { id: toastId });
    } catch (err) {
      console.error("Compression failed:", err);
      // Fallback to raw if compression fails
      const reader = new FileReader();
      reader.onload = () => {
        setter(reader.result);
        toast.dismiss(toastId);
      };
      reader.readAsDataURL(file);
    }
  };

  // Detect mobile device (where capture="environment" works natively)
  const isMobileDevice = () => {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || ('ontouchstart' in window && navigator.maxTouchPoints > 1);
  };

  // Stop any active webcam stream
  const stopWebcamStream = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(track => track.stop());
      webcamStreamRef.current = null;
    }
  }, []);

  // Start webcam stream for desktop capture
  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      webcamStreamRef.current = stream;
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Webcam start failed:', err);
      toast.error('Failed to access webcam. Please use Gallery instead.');
      setShowWebcam(false);
      stopWebcamStream();
    }
  };

  // Capture a frame from the webcam video
  const captureWebcamPhoto = () => {
    const video = webcamVideoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = webcamCanvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const target = webcamTarget;
    if (target === 'pickup') {
      if (pickupPhoto) { setExtraPickupPhotos(prev => [...prev, dataUrl]); } else { setPickupPhoto(dataUrl); }
    } else if (target === 'delivery') {
      if (deliveryPhoto) { setExtraDeliveryPhotos(prev => [...prev, dataUrl]); } else { setDeliveryPhoto(dataUrl); }
    } else if (target === 'openBox') {
      setOpenBoxPhoto(dataUrl);
    }
    toast.success('Photo captured!');
    closeWebcam();
  };

  // Close webcam modal and stop stream
  const closeWebcam = () => {
    stopWebcamStream();
    setShowWebcam(false);
    setWebcamTarget(null);
  };

  const openCamera = async (target) => {
    if (isUpdatingOrderStatus) return;
    try {
      // On mobile: use native file input with capture="environment"
      if (isMobileDevice()) {
        const hasPermission = await requestCameraPermission();
        if (!hasPermission) return;
        setTimeout(() => {
          if (target === 'pickup' && pickupInputRef.current) pickupInputRef.current.click();
          if (target === 'delivery' && deliveryInputRef.current) deliveryInputRef.current.click();
          if (target === 'openBox' && openBoxInputRef.current) openBoxInputRef.current.click();
        }, 100);
        return;
      }
      // On desktop: open webcam modal with live video stream
      setWebcamTarget(target);
      setShowWebcam(true);
    } catch (err) {
      console.error("Camera trigger failed:", err);
      toast.error("Failed to open camera. Please try using the Gallery.");
    }
  };

  // handleAddExtraPhoto: append to extras array
  const handleAddExtraPhoto = (file, setExtra) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setExtra(prev => [...prev, reader.result]);
    reader.readAsDataURL(file);
  };

  const removeExtraPhoto = (idx, setExtra) => {
    setExtra(prev => prev.filter((_, i) => i !== idx));
  };

  if (isLoadingOrder || !isLoaded) {
    return <div className="min-h-screen flex items-center justify-center bg-white"><div className="w-8 h-8 border-3 border-slate-100 border-t-indigo-600 rounded-full animate-spin" /></div>;
  }

  if (!order) return <div className="p-8 text-center text-slate-500 text-sm">Order not found</div>;

  if (showSuccess || order.status === 'delivered' || order.status === 'try_buy_completed') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white mb-4 border-4 border-emerald-50">
          <FiCheckCircle size={32} />
        </motion.div>
        <h1 className="text-xl font-bold text-slate-800">Job Complete</h1>
        <p className="text-slate-500 text-[10px] mt-2 mb-6 max-w-[240px] leading-relaxed uppercase tracking-widest font-bold">Delivery recorded successfully. <br /> Records have been updated.</p>
        
        {/* Route Summary */}
        {order.type !== 'return' && (
          <div className="w-full max-w-sm mb-6 bg-slate-50 border border-slate-100 rounded-3xl p-5 text-left shadow-sm">
             <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.15em] mb-5 flex items-center gap-2 border-b border-slate-200 pb-2">
               <FiNavigation className="text-indigo-600" size={14} /> Mission Route Summary
             </h3>
             
             <div className="relative pl-5 border-l-[3px] border-indigo-100 space-y-6">
               {/* Vendor Stops */}
               {order.vendorPickups && order.vendorPickups.length > 0 ? order.vendorPickups.map((vp, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-indigo-500 border-[3px] border-white shadow-sm" />
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Pickup {i+1}</p>
                    <p className="text-xs font-black text-slate-800 leading-tight">{vp.vendorName}</p>
                    <p className="text-[10px] font-bold text-slate-500 truncate mt-0.5 opacity-80">{vp.shopAddress}</p>
                  </div>
               )) : (
                  <div className="relative">
                    <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-indigo-500 border-[3px] border-white shadow-sm" />
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Pickup</p>
                    <p className="text-xs font-black text-slate-800 leading-tight">{order.vendorItems?.[0]?.vendorId?.storeName || order.vendorName || 'Vendor'}</p>
                    <p className="text-[10px] font-bold text-slate-500 truncate mt-0.5 opacity-80">{order.vendorItems?.[0]?.vendorId?.shopAddress || order.vendorAddress || 'Store Location'}</p>
                  </div>
               )}
               
               {/* Customer Drop-off */}
               <div className="relative">
                 <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-emerald-500 border-[3px] border-white shadow-[0_0_0_2px_rgba(16,185,129,0.15)]" />
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Drop-off</p>
                 <p className="text-xs font-black text-slate-800 leading-tight">{typeof order.userId === 'object' ? order.userId?.name : (order.customer || order.shippingAddress?.name || 'Customer')}</p>
                 <p className="text-[10px] font-bold text-slate-500 truncate mt-0.5 opacity-80">{order.address || order.shippingAddress?.address || 'Customer Location'}</p>
               </div>
             </div>

             {/* Distance & Earnings */}
             <div className="mt-6 pt-3 flex justify-between items-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
               <div className="flex flex-col">
                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Distance</span>
                 <span className="text-sm font-black text-slate-800 flex items-center gap-1.5"><FiMapPin className="text-slate-400" size={13} /> {order.deliveryDistance ? `${order.deliveryDistance} km` : 'Calculated automatically'}</span>
               </div>
               <div className="flex flex-col text-right">
                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Trip Earnings</span>
                 <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-xl border border-emerald-100">{formatPrice(order.deliveryEarnings || 0)}</span>
               </div>
             </div>
          </div>
        )}

        {/* Customer Rating Card - Only for successful deliveries, not returns */}
        {order.type !== 'return' && (
            <CustomerRatingCard 
                orderId={order._id || id} 
                customerId={typeof order.userId === 'object' ? (order.userId?._id || order.userId?.id) : (order.userId || order.customerData?.id || order.customerData?._id)}
                customerName={typeof order.userId === 'object' ? (order.userId?.name) : (order.customer || order.shippingAddress?.name)}
            />
        )}
        
        <button onClick={() => navigate('/delivery/dashboard')} className="w-full max-w-sm h-14 bg-slate-900 text-white rounded-[1.25rem] text-[11px] font-black uppercase tracking-widest mt-6 shadow-xl shadow-slate-200">Back to Home</button>
      </div>
    );
  }

  const getOrderTypeBadge = () => {
    const hasReturnRequested = ['return_requested', 'awaiting_return'].includes(String(order?.rawStatus || '').toLowerCase());
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {isCheckAndBuy && <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-[8.5px] font-black border border-indigo-100 uppercase tracking-tighter">Check & Buy</span>}
        {isTryAndBuy && <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-[8.5px] font-black border border-amber-100 uppercase tracking-tighter">Try & Buy</span>}
        {!isCheckAndBuy && !isTryAndBuy && <span className="bg-slate-50 text-slate-700 px-2 py-0.5 rounded-full text-[8.5px] font-black border border-slate-100 uppercase tracking-tighter">Standard</span>}
        <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-black border uppercase tracking-tighter ${order?.paymentMethod === 'prepaid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
          {order?.paymentMethod === 'prepaid' ? 'PREPAID' : 'COD'}
        </span>
        {hasReturnRequested && (
          <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full text-[8.5px] font-black border border-rose-100 uppercase tracking-tighter">Return Requested</span>
        )}
      </div>
    );
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-50 pb-32 relative">
        {/* HEADER - FLOATING ON TOP */}
        <header className="sticky top-0 left-0 right-0 z-50 px-4 py-4 flex items-center gap-3 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm">
          <button onClick={() => {
            if (isAvailableTask) {
              const confirmed = window.confirm('⚠️ Kya aap wapas jaana chahte hain? Agar aapne order accept nahi kiya toh ye kisi aur ko assign ho jayega!');
              if (!confirmed) return;
            }
            navigate(-1);
          }} className="p-2 bg-white shadow-sm rounded-lg shrink-0 border border-slate-100"><FiArrowLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-black text-slate-900 leading-tight mb-0.5 truncate">
              {/* Use id from params as final fallback, and hunt for names in all possible places */}
              #{String(order.orderId || order.id || id).slice(-8).toUpperCase()} • {currentPhase === 'pickup' ? (order.vendorItems?.[0]?.vendorId?.storeName || order.vendorName || 'Pickup Location') : (order.customer || order.shippingAddress?.name || order.guestInfo?.name || 'Customer')}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 overflow-hidden">
              {getOrderTypeBadge()}
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter shrink-0">• {String(order.status).replace(/_/g, ' ').toUpperCase()}</span>
            </div>
          </div>
          <a href={`tel:${currentPhase === 'pickup' ? (order.vendorItems?.[0]?.vendorId?.phone || order.vendorPhone) : (order.phone || order.shippingAddress?.phone)}`} className="w-9 h-9 bg-indigo-600/90 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200/50 shrink-0"><FiPhone size={18} /></a>
        </header>

        <div className="max-w-md mx-auto pt-4">
          {/* HERO MAP SECTION - AT TRUE TOP */}
          {(!hasArrived && currentPhase) && (
            <div className="w-full h-[540px] bg-white relative">
              <TrackingMap
                deliveryLocation={currentLocation}
                vendorLocation={order.vendorLatitude ? { lat: Number(order.vendorLatitude), lng: Number(order.vendorLongitude) } : (order.vendorItems?.[0]?.vendorId?.shopLocation?.coordinates ? { lat: order.vendorItems[0].vendorId.shopLocation.coordinates[1], lng: order.vendorItems[0].vendorId.shopLocation.coordinates[0] } : null)}
                customerLocation={order.latitude ? { lat: Number(order.latitude), lng: Number(order.longitude) } : (order.dropoffLocation?.coordinates ? { lat: order.dropoffLocation.coordinates[1], lng: order.dropoffLocation.coordinates[0] } : null)}
                status={order.rawStatus || order.status}
                customerAddress={order.address || order.shippingAddress?.address}
                vendorAddress={order.vendorAddress || order.vendorItems?.[0]?.vendorId?.shopAddress}
                followMode={true}
                isLoaded={isLoaded}
              />
              {/* ADDRESS OVERLAY ON MAP */}
              <div className="absolute bottom-6 left-4 right-4 flex items-end justify-between gap-3 pointer-events-none z-10">
                 <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-slate-100 flex-1 pointer-events-auto">
                    <div className="flex items-center justify-between mb-1">
                       <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">{currentPhase === 'pickup' ? 'PICKUP FROM' : 'DELIVER TO'}</p>
                       {(currentPhase === 'pickup' ? order.vendorPhone : order.phone) && (
                         <a href={`tel:${currentPhase === 'pickup' ? order.vendorPhone : order.phone}`} className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg text-[9px] font-black active:scale-95 transition-transform">
                            <FiPhone size={10} />
                            {currentPhase === 'pickup' ? order.vendorPhone : order.phone}
                         </a>
                       )}
                    </div>
                    <p className="text-xs font-black text-slate-800 leading-tight mb-1 truncate">{currentPhase === 'pickup' ? order.vendorName : order.customer}</p>
                    <p className="text-[10px] font-medium text-slate-500 leading-snug line-clamp-2">{currentPhase === 'pickup' ? order.vendorAddress : order.address}</p>
                 </div>
                 <button
                   onClick={() => {
                       let destLat = 0;
                       let destLng = 0;
                       
                       if (currentPhase === 'returning_unselected' && order.vendorReturnStops?.length > 0) {
                           // Route to the first pending return stop
                           const nextStop = order.vendorReturnStops.find(s => s.status === 'pending') || order.vendorReturnStops[0];
                           const vendorInfo = order.vendorItems?.find(vi => String(vi.vendorId?._id || vi.vendorId) === String(nextStop.vendorId))?.vendorId;
                           destLat = vendorInfo?.shopLocation?.coordinates?.[1] || nextStop.shopLocation?.coordinates?.[1] || 0;
                           destLng = vendorInfo?.shopLocation?.coordinates?.[0] || nextStop.shopLocation?.coordinates?.[0] || 0;
                       } else {
                           destLat = currentPhase === 'pickup' ? (order.vendorLatitude || order.vendorItems?.[0]?.vendorId?.shopLocation?.coordinates?.[1]) : (order.latitude || order.dropoffLocation?.coordinates?.[1]);
                           destLng = currentPhase === 'pickup' ? (order.vendorLongitude || order.vendorItems?.[0]?.vendorId?.shopLocation?.coordinates?.[0]) : (order.longitude || order.dropoffLocation?.coordinates?.[0]);
                       }
                       
                       let mapUrl = `https://www.google.com/maps/dir//${destLat || 0},${destLng || 0}/`;
                       if (currentLocation) {
                           const currentLat = currentLocation.lat || currentLocation.coordinates?.[1] || currentLocation[1];
                           const currentLng = currentLocation.lng || currentLocation.coordinates?.[0] || currentLocation[0];
                           if (currentLat && currentLng) {
                               mapUrl = `https://www.google.com/maps/dir/${currentLat},${currentLng}/${destLat || 0},${destLng || 0}/`;
                           }
                       }
                       window.open(mapUrl, '_blank');
                   }}
                   className="shrink-0 bg-slate-900 text-white w-[60px] h-[60px] rounded-2xl shadow-xl shadow-slate-300 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform pointer-events-auto border-2 border-slate-800"
                 >
                   <FiNavigation size={22} className="text-amber-400" />
                   <span className="text-[8px] font-black uppercase tracking-widest">NAV</span>
                 </button>
              </div>
            </div>
          )}

          <div className="p-4 space-y-4">
            {/* ACTIONS SECTION */}
            {currentPhase === 'returning_unselected' && (
              <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm mt-4 mb-4">
                <p className="text-[11px] font-bold text-slate-800 uppercase tracking-widest mb-3">Return Unselected Items</p>
                <div className="space-y-3">
                  {order.vendorReturnStops?.map((stop, idx) => (
                      <div key={idx} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-xs font-bold text-slate-800">{stop.vendorName}</p>
                            <p className="text-[10px] text-slate-500 mb-2">{stop.shopAddress}</p>
                          </div>
                          <button
                            onClick={() => {
                                const vendorInfo = order.vendorItems?.find(vi => String(vi.vendorId?._id || vi.vendorId) === String(stop.vendorId))?.vendorId;
                                const destLat = vendorInfo?.shopLocation?.coordinates?.[1] || stop.shopLocation?.coordinates?.[1] || 0;
                                const destLng = vendorInfo?.shopLocation?.coordinates?.[0] || stop.shopLocation?.coordinates?.[0] || 0;
                                
                                let mapUrl = `https://www.google.com/maps/dir//${destLat},${destLng}/`;
                                if (currentLocation) {
                                    const currentLat = currentLocation.lat || currentLocation.coordinates?.[1] || currentLocation[1];
                                    const currentLng = currentLocation.lng || currentLocation.coordinates?.[0] || currentLocation[0];
                                    if (currentLat && currentLng) {
                                        mapUrl = `https://www.google.com/maps/dir/${currentLat},${currentLng}/${destLat},${destLng}/`;
                                    }
                                }
                                window.open(mapUrl, '_blank');
                            }}
                            className="w-8 h-8 bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center shrink-0 border border-slate-300 active:scale-95"
                          >
                            <FiNavigation size={14} />
                          </button>
                        </div>
                        {stop.status === 'returned' ? (
                           <div className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold">
                             <FiCheckCircle size={12} /> RETURNED
                           </div>
                        ) : stop.status === 'pending' ? (
                          <button
                            onClick={() => handleArriveVendorReturn(stop.vendorId)}
                            disabled={isUpdatingOrderStatus}
                            className="w-full h-10 bg-slate-900 text-white text-[10px] font-bold rounded-lg uppercase tracking-widest active:scale-95 transition-all"
                          >
                            ARRIVE AT LOCATION
                          </button>
                        ) : stop.status === 'arrived' ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-row items-stretch gap-2 h-10">
                              <input
                                type="text"
                                placeholder="ENTER OTP"
                                value={vendorReturnOtps[stop.vendorId] || ''}
                                onChange={(e) => setVendorReturnOtps(prev => ({...prev, [stop.vendorId]: e.target.value}))}
                                className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2 text-xs font-bold tracking-widest text-center"
                                maxLength={6}
                              />
                              <button
                                onClick={() => handleVerifyVendorReturnOtp(stop.vendorId)}
                                disabled={isUpdatingOrderStatus || !vendorReturnOtps[stop.vendorId]}
                                className="shrink-0 bg-indigo-600 text-white px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
                              >
                                VERIFY
                              </button>
                            </div>
                            <button
                                onClick={() => handleResendVendorReturnOtp(stop.vendorId)}
                                disabled={isUpdatingOrderStatus}
                                className="w-full h-10 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg uppercase tracking-widest active:scale-95 transition-all mt-1 border border-slate-200"
                              >
                                RESEND OTP
                              </button>
                          </div>
                        ) : stop.status === 'otp_verified' ? (
                          <button
                            onClick={() => handleCompleteVendorReturn(stop.vendorId)}
                            disabled={isUpdatingOrderStatus}
                            className="w-full h-10 bg-emerald-600 text-white text-[10px] font-bold rounded-lg uppercase tracking-widest active:scale-95 transition-all"
                          >
                            CONFIRM RETURN
                          </button>
                        ) : null}
                      </div>
                  ))}
                </div>
              </div>
            )}

            {(!hasArrived && currentPhase === 'delivery') || (currentPhase === 'pickup') ? (
              <div className="space-y-3">
                {currentPhase === 'pickup' ? (
                  <div className="flex flex-col gap-3">
                    {!hasArrivedAtVendor && (
                      <button
                        onClick={handleReachedVendor}
                        disabled={isUpdatingOrderStatus}
                        className="w-full h-12 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-slate-200 active:scale-95 transition-all disabled:opacity-50"
                      >
                        {isUpdatingOrderStatus ? 'NOTIFYING...' : <><FiMapPin size={16} /> I HAVE REACHED VENDOR</>}
                      </button>
                    )}

                    {/* MULTI-PHOTO GRID */}
                    {hasArrivedAtVendor && (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl mb-2">
                          <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                              <FiPackage size={14} /> Items to Pickup
                          </p>
                          <div className="space-y-3">
                              {order.items?.map((item, iIdx) => (
                                  <div key={iIdx} className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
                                      <div className="w-12 h-14 bg-slate-100 rounded-lg overflow-hidden shrink-0">
                                          <img src={item.productId?.image || item.image || item.productId?.images?.[0]} alt={item.name} className="w-full h-full object-cover" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                          <p className="text-[11px] font-bold text-slate-900 line-clamp-1">{item.productId?.name || item.name}</p>
                                              <div className="flex flex-wrap gap-2 mt-1">
                                                  {Object.entries(item.variant || {}).map(([key, val]) => (
                                                      <span key={key} className="bg-slate-50 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-500 uppercase">
                                                          {key}: {val}
                                                      </span>
                                                  ))}
                                                  {!item.variant && item.selectedSize && (
                                                      <span className="bg-slate-50 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-500 uppercase">
                                                          Size: {item.selectedSize}
                                                      </span>
                                                  )}
                                                  {!item.variant && item.selectedColor && (
                                                      <span className="bg-slate-50 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-500 uppercase">
                                                          Color: {item.selectedColor}
                                                      </span>
                                                  )}
                                                  <span className="bg-slate-50 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-500 uppercase">
                                                      Qty: {item.quantity}
                                                  </span>
                                              </div>
                                      </div>
                                  </div>
                              )) || (
                                  <p className="text-[11px] text-slate-500 font-medium">No items found.</p>
                              )}
                          </div>
                      </div>
                    )}
                    
                    {(pickupPhoto || extraPickupPhotos.length > 0) && (
                      <div className="bg-white rounded-2xl border border-slate-100 p-3 shadow-sm">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">PICKUP PHOTOS ({1 + extraPickupPhotos.length})</p>
                        <div className="grid grid-cols-3 gap-2">
                          {/* Primary photo */}
                          {pickupPhoto && (
                            <div className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 group">
                              <img src={pickupPhoto} className="w-full h-full object-cover" />
                              <button onClick={() => { if (extraPickupPhotos.length > 0) { setPickupPhoto(extraPickupPhotos[0]); setExtraPickupPhotos(prev => prev.slice(1)); } else { setPickupPhoto(null); } }} className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center text-[10px] leading-none backdrop-blur-sm">×</button>
                              <span className="absolute bottom-1 left-1 text-[7px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded uppercase">Main</span>
                            </div>
                          )}
                          {/* Extra photos */}
                          {extraPickupPhotos.map((photo, idx) => (
                            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-100">
                              <img src={photo} className="w-full h-full object-cover" />
                              <button onClick={() => setExtraPickupPhotos(prev => prev.filter((_, i) => i !== idx))} className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center text-[10px] leading-none backdrop-blur-sm">×</button>
                            </div>
                          ))}
                          {/* Add more button */}
                          <button onClick={() => openCamera('pickup')} className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 text-slate-400 active:bg-slate-50 transition-all">
                            <FiCamera size={20} />
                            <span className="text-[7px] font-black uppercase">Add More</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Camera/Gallery buttons - only after reaching vendor */}
                    {hasArrivedAtVendor && !pickupPhoto && (
                      <div className="flex gap-2">
                        <div className="flex-1 flex gap-2">
                          <button onClick={() => openCamera('pickup')} className="w-full h-12 bg-white border-2 border-slate-900 text-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:bg-slate-50 transition-all"><FiCamera size={16} /> CAMERA</button>
                          {/* <button onClick={() => pickupGalleryRef.current.click()} className="flex-1 h-12 bg-slate-50 text-slate-500 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-200 active:bg-slate-100 transition-all"><FiImage size={14} /> GALLERY</button> */}
                        </div>
                      </div>
                    )}
                    <input type="file" accept="image/*" capture="environment" ref={pickupInputRef} onChange={(e) => { const f = e.target.files[0]; if (!f) return; if (pickupPhoto) { handleImage(f, (img) => setExtraPickupPhotos(prev => [...prev, img])); } else { handleImage(f, setPickupPhoto); } e.target.value = ''; }} className="hidden" />
                    <input type="file" accept="image/*" multiple ref={pickupGalleryRef} onChange={(e) => { const files = Array.from(e.target.files || []); files.forEach((f, i) => { if (i === 0 && !pickupPhoto) { handleImage(f, setPickupPhoto); } else { handleImage(f, (img) => setExtraPickupPhotos(prev => [...prev, img])); } }); e.target.value = ''; }} className="hidden" />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 w-full">
                    <button
                      onClick={handleArrival}
                      disabled={isUpdatingOrderStatus}
                      className="w-full h-12 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-slate-200 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isUpdatingOrderStatus ? 'PROCESSING...' : <><FiZap size={16} className="text-amber-400 animate-pulse" /> I HAVE ARRIVED (GET OTP)</>}
                    </button>
                    <button
                      onClick={handleCancelOrder}
                      disabled={isUpdatingOrderStatus}
                      className="w-full h-11 border-2 border-rose-200 text-rose-500 bg-rose-50/30 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 active:bg-rose-100 transition-colors disabled:opacity-50"
                    >
                      <FiX size={16} /> Cancel Order (Customer Refused)
                    </button>
                  </div>
                )}
              </div>
            ) : currentPhase !== 'returning_unselected' ? (
              <>
                {/* ADDRESS & DETAILS */}
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{currentPhase === 'pickup' ? 'PICKUP FROM' : 'DELIVER TO'}</p>
                      <h3 className="text-base font-bold text-slate-800 leading-tight">{currentPhase === 'pickup' ? order.vendorName : order.customer}</h3>
                      <div className="flex items-start gap-1.5 mt-2 text-slate-500">
                        <FiMapPin className="shrink-0 mt-0.5" size={12} />
                        <p className="text-[11px] font-medium leading-relaxed">{currentPhase === 'pickup' ? order.vendorAddress : order.address}</p>
                      </div>
                    </div>
                    <div className="w-10 h-10 bg-slate-50 text-indigo-600 rounded-2xl flex items-center justify-center border border-slate-100 shrink-0">
                      {currentPhase === 'pickup' ? <FiPackage size={20} /> : <FiUser size={20} />}
                    </div>
                  </div>

                  {/* ITEMS LIST */}
                  <div className="border-t border-slate-50 pt-4 mt-1">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[9px] font-bold text-slate-800 uppercase tracking-widest leading-none">MANIFEST ({order.items?.length})</p>
                      <p className="text-xs font-bold text-indigo-600">{formatPrice(order.isTryAndBuy && hasArrived ? calculatedTotal : order.total)}</p>
                    </div>
                    <div className="space-y-2">
                      {order.items?.map((item, idx) => {
                        const isPicked = selectedItemIds.has(idx);
                        const isSelectionMode = isTryAndBuy && hasArrived;
                        return (
                          <div
                            key={idx}
                            onClick={() => isSelectionMode && toggleItem(idx)}
                            className={`flex gap-3 p-2 rounded-xl border transition-all ${isSelectionMode ? (isPicked ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-transparent opacity-60') : 'bg-slate-50 border-transparent'}`}
                          >
                            <div className="w-10 h-10 bg-white rounded-lg overflow-hidden border border-slate-100 shrink-0">
                              {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <FiPackage className="text-slate-200 mt-2.5 mx-auto" size={16} />}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                              <p className="text-[11px] font-bold text-slate-800 leading-tight">{item.productName || item.name}</p>
                              <p className="text-[9px] font-bold text-slate-400 mt-0.5 uppercase tracking-tighter">
                                Qty: {item.quantity} • {item.originalPrice && item.originalPrice > item.price && (
                                  <span className="line-through mr-1 opacity-50">{formatPrice(item.originalPrice)}</span>
                                )}
                                {formatPrice(item.price)}
                              </p>
                            </div>
                            {isSelectionMode && (
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 my-auto ${isPicked ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-200'}`}>
                                {isPicked ? <FiCheckCircle size={12} /> : <div className="w-2.5 h-2.5 border border-slate-300 rounded-full" />}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {(isTryAndBuy || isCheckAndBuy) && hasArrived && !order.tryAndBuyCompleted && (
                      <button onClick={handleItemConfirmation}
                        disabled={isUpdatingOrderStatus}
                        className="w-full mt-4 h-10 bg-slate-900 text-white font-bold rounded-2xl text-[10px] uppercase tracking-[0.1em] disabled:opacity-50"
                      >
                        {isUpdatingOrderStatus ? 'CONFIRMING...' : (isTryAndBuy ? 'Confirm Selection' : 'Confirm Handover')}</button>
                    )}
                  </div>
                </div>

                {/* ACTION & PROOF */}
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-bold text-slate-800 uppercase tracking-widest">Verification Proof</p>
                      <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded leading-none uppercase">{(currentPhase || 'Phase').toUpperCase()}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div className="relative aspect-[16/9] bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 flex items-center justify-center group shadow-inner">
                        {(currentPhase === 'pickup' ? pickupPhoto : deliveryPhoto) ? (
                          <>
                            <img src={currentPhase === 'pickup' ? pickupPhoto : deliveryPhoto} className="w-full h-full object-cover" />
                            <button onClick={() => currentPhase === 'pickup' ? setPickupPhoto(null) : setDeliveryPhoto(null)} className="absolute top-2 right-2 w-7 h-7 bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-md shadow-lg text-sm leading-none">×</button>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-3">
                            <button onClick={() => openCamera(currentPhase === 'pickup' ? 'pickup' : 'delivery')} className="flex flex-col items-center gap-1.5 text-indigo-600 active:scale-95 transition-transform">
                              <FiCamera size={28} />
                              <span className="text-[9px] font-black uppercase tracking-tight">OPEN CAMERA</span>
                            </button>
                            {/* <div className="w-12 h-px bg-slate-200" />
                            <button onClick={() => (currentPhase === 'pickup' ? pickupGalleryRef.current : deliveryGalleryRef.current).click()} className="flex flex-col items-center gap-1.5 text-slate-400 active:scale-95 transition-transform">
                              <FiImage size={24} />
                              <span className="text-[8px] font-black uppercase tracking-tight">GALLERY</span>
                            </button> */}
                          </div>
                        )}
                        <input type="file" accept="image/*" capture="environment" ref={deliveryInputRef} onChange={(e) => handleImage(e.target.files[0], currentPhase === 'pickup' ? setPickupPhoto : setDeliveryPhoto)} className="hidden" />
                        <input type="file" accept="image/*" ref={deliveryGalleryRef} onChange={(e) => handleImage(e.target.files[0], currentPhase === 'pickup' ? setPickupPhoto : setDeliveryPhoto)} className="hidden" />
                      </div>

                      {currentPhase === 'delivery' && (
                        <div className="space-y-3 pt-3 border-t border-slate-50">
                          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest italic">Optional: Item Inspection Photo</p>
                          <div className="relative aspect-[16/9] bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 flex items-center justify-center group shadow-inner">
                            {openBoxPhoto ? (
                              <>
                                <img src={openBoxPhoto} className="w-full h-full object-cover" />
                                <button onClick={() => setOpenBoxPhoto(null)} className="absolute top-2 right-2 w-7 h-7 bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-md shadow-lg text-sm leading-none">×</button>
                              </>
                            ) : (
                              <div className="flex items-center gap-8">
                                <button onClick={() => openCamera('openBox')} className="flex flex-col items-center gap-1.5 text-indigo-600 active:scale-95 transition-transform">
                                  <FiCamera size={26} />
                                  <span className="text-[8px] font-black uppercase tracking-tight leading-none">OPEN CAMERA</span>
                                </button>
                                {/* <button onClick={() => openBoxGalleryRef.current.click()} className="flex flex-col items-center gap-1.5 text-slate-400 active:scale-95 transition-transform">
                                  <FiImage size={24} />
                                  <span className="text-[8px] font-black uppercase tracking-tight leading-none">GALLERY</span>
                                </button> */}
                              </div>
                            )}
                            <input type="file" accept="image/*" capture="environment" ref={openBoxInputRef} onChange={(e) => handleImage(e.target.files[0], setOpenBoxPhoto)} className="hidden" />
                            <input type="file" accept="image/*" ref={openBoxGalleryRef} onChange={(e) => handleImage(e.target.files[0], setOpenBoxPhoto)} className="hidden" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* OTP AREA */}
                  {currentPhase === 'delivery' && (
                    <div className="pt-4 border-t border-slate-100/50 text-center">
                      <p className="text-[9px] font-bold text-slate-800 uppercase tracking-[0.2em] mb-4">Security Terminal</p>

                      <div className="max-w-[210px] mx-auto space-y-3">
                        <div className="relative group">
                          <input
                            type="tel" maxLength={6} value={otpValue}
                            onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                            placeholder="Enter 6-digit OTP"
                            className="w-full h-14 bg-white border-2 border-slate-200 rounded-2xl text-center text-base sm:text-xl font-black tracking-widest sm:tracking-[0.2em] text-slate-900 placeholder:text-slate-400 placeholder:text-xs sm:placeholder:text-[13px] placeholder:font-semibold placeholder:tracking-wide outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm"
                          />
                          <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none opacity-20">
                            <FiShield size={18} />
                          </div>
                        </div>
                        <button
                          onClick={handleOtpResend}
                          disabled={isResending}
                          className="w-full flex items-center justify-center gap-2 py-2.5 text-[9px] font-bold text-indigo-600 bg-indigo-50/50 rounded-xl active:bg-indigo-50 transition-colors uppercase tracking-[0.1em] shadow-sm active:scale-95"
                        >
                          {isResending ? 'GENERATING NEW OTP...' : <><FiSend size={12} /> RE-GENERATE & RESEND OTP</>}
                        </button>
                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tight leading-none px-2 mt-2 opacity-60">OTP is sent only during active arrival session.</p>

                        <button
                          onClick={handleCancelOrder}
                          disabled={isUpdatingOrderStatus}
                          className="w-full mt-4 py-2 flex items-center justify-center gap-2 text-[8px] font-black text-rose-500 bg-rose-50/50 rounded-xl active:bg-rose-100 transition-all uppercase tracking-[0.1em] disabled:opacity-50"
                        >
                          <FiAlertTriangle size={10} /> CUSTOMER REFUSED / CANCEL MISSION
                        </button>
                      </div>

                      {/* PAYMENT OPTIONS */}
                      {isCod && (!order.isTryAndBuy || order.tryAndBuyCompleted) && (
                        <div className="mt-6 pt-5 border-t border-slate-50 text-left">
                          <div className="flex items-center justify-between mb-4">
                            <div className="min-w-0">
                              <p className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-1 tracking-tighter">{isCod ? 'Amount Due' : 'Paid Online'}</p>
                              <p className={`text-xl font-black leading-none ${isCod ? 'text-slate-900' : 'text-emerald-600'}`}>{formatPrice(calculatedTotal)}</p>
                            </div>
                            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                              <FiCreditCard size={18} className="text-indigo-600" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => handlePaymentMethod('cash')}
                              disabled={isUpdatingOrderStatus || order.paymentStatus === 'paid'}
                              className={`h-11 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all active:scale-95 ${paymentSelection === 'cash' ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-500 border-slate-100'} ${order.paymentStatus === 'paid' ? 'opacity-30 cursor-not-allowed' : ''}`}
                            >
                              {isUpdatingOrderStatus && paymentSelection === 'cash' ? 'SELECTING...' : 'CASH'}
                            </button>
                            <button
                              onClick={() => handlePaymentMethod('qr')}
                              disabled={isUpdatingOrderStatus || order.paymentStatus === 'paid'}
                              className={`h-11 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all active:scale-95 ${order.paymentStatus === 'paid' ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-100' : (paymentSelection === 'qr' ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-100' : 'bg-white text-slate-500 border-slate-100')}`}
                            >
                              {order.paymentStatus === 'paid' ? 'PAID (RAZORPAY)' : (isUpdatingOrderStatus && paymentSelection === 'qr' ? 'LAUNCHING...' : 'UPI QR')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* BOTTOM ACTION BUTTON */}
        {!isOrderFinished && (
          <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-md border-t border-slate-100 z-50">
            {isAvailableTask ? (
            <div className="flex gap-3">
              <button
                onClick={handleRejectMission}
                disabled={isUpdatingOrderStatus}
                className="flex-1 h-12 bg-slate-100 text-slate-500 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] border border-slate-200 active:scale-95 transition-all disabled:opacity-50"
              >
                Decline
              </button>
              <button
                onClick={handleAcceptMission}
                disabled={isUpdatingOrderStatus || hasActiveTask}
                className={`flex-[2] h-12 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all ${hasActiveTask ? 'bg-slate-200 text-slate-400 shadow-none' : 'bg-indigo-600 text-white shadow-indigo-200'}`}
              >
                {isUpdatingOrderStatus ? 'ACCEPTING MISSION...' : hasActiveTask ? 'MISSION IN PROGRESS' : 'ACCEPT TASK TO START'}
              </button>
            </div>
          ) : isAssignedToMe ? (
            ((currentPhase === 'pickup' && pickupPhoto) || (currentPhase === 'delivery' && hasArrived)) ? (
              <button
                onClick={currentPhase === 'pickup' ? () => { const allPhotos = [pickupPhoto, ...extraPickupPhotos].filter(Boolean); const combined = allPhotos.length > 1 ? allPhotos.join('|||') : allPhotos[0]; handleUpdateStatus('picked_up', 'Items picked up!', { pickupPhoto: combined }); } : handleFinalize}
                disabled={
                  isUpdatingOrderStatus ||
                  (currentPhase === 'delivery' && (
                    otpValue.length < 6 ||
                    !deliveryPhoto ||
                    (isCod && (!paymentSelection || !['cash', 'qr'].includes(paymentSelection))) ||
                    (isCod && paymentSelection === 'qr' && order.paymentStatus !== 'paid') ||
                    (order.isTryAndBuy && !order.tryAndBuyCompleted)
                  ))
                }
                className="w-full h-12 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-200 disabled:opacity-20 active:scale-95 transition-all"
              >
                {isUpdatingOrderStatus ? 'WAITING...' : (
                  currentPhase === 'pickup'
                    ? 'MARk AS PICKED UP'
                    : (order.isTryAndBuy && !order.tryAndBuyCompleted)
                      ? 'CONFIRM SELECTION FIRST'
                      : (isCod && (!paymentSelection || !['cash', 'qr'].includes(paymentSelection)))
                        ? 'SELECT PAYMENT METHOD'
                        : (isCod && paymentSelection === 'qr' && order.paymentStatus !== 'paid')
                          ? 'AWAITING PAYMENT VERIFICATION'
                          : 'DELIVERED SUCCESSFULLY'
                )}
              </button>
            ) : (
              <div className="text-center py-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Mission Active</p>
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight">Complete {currentPhase === 'pickup' ? 'Pickup Verification' : currentPhase === 'returning_unselected' ? 'Vendor Returns' : 'Arrival & OTP'} to Finish</p>
              </div>
            )
          ) : (
            <div className="text-center py-2 px-4 bg-rose-50 rounded-xl border border-rose-100">
              <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-0.5">UNAUTHORIZED ACCESS</p>
              <p className="text-[8px] font-bold text-rose-400 uppercase leading-none">This task is assigned to another partner.</p>
            </div>
            )}
          </div>
        )}

        {/* QR MODAL */}
        <AnimatePresence>
          {showQRModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                className="bg-white w-full max-w-xs rounded-[2.5rem] p-6 shadow-2xl relative border-b-[10px] border-indigo-600 overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 opacity-50" />
                <button onClick={() => setShowQRModal(false)} className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 transition-colors bg-slate-50 rounded-full z-10"><FiX size={18} /></button>

                <div className="text-center relative">
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-1">UPI Payment Gateway</p>
                  <h4 className="text-sm font-black text-slate-800 mb-6 font-mono border-b border-slate-100 pb-4">{formatPrice(calculatedTotal)}</h4>

                  <div className="bg-white border-2 border-slate-50 rounded-[1.5rem] flex items-center justify-center p-1 mb-6 shadow-xl relative group overflow-hidden">
                    <img src={qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=closh@upi&pn=Closh&am=${calculatedTotal}&cu=INR`} alt="Payment QR" className="w-full h-auto max-h-[50vh] object-contain rounded-[1.2rem]" />
                    <div className="absolute inset-0 border-4 border-white rounded-[1.5rem] pointer-events-none" />
                  </div>

                  <p className="text-[9px] font-bold text-slate-400 px-2 leading-tight uppercase tracking-tighter mb-8">Scan QR with any UPI app.</p>
                  <button onClick={handleVerifyQRPayment} disabled={isVerifyingQR} className={`w-full h-12 ${isVerifyingQR ? 'bg-indigo-400' : 'bg-indigo-600'} text-white rounded-2xl text-[11px] font-black shadow-lg shadow-indigo-100 uppercase tracking-[0.1em] flex items-center justify-center gap-2`}>
                    {isVerifyingQR ? 'VERIFYING...' : <><FiCheckCircle size={16} /> VERIFY PAYMENT</>}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop Webcam Capture Modal */}
        <AnimatePresence>
          {showWebcam && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] bg-black/90 flex flex-col items-center justify-center"
              onClick={closeWebcam}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative w-full max-w-lg mx-4 bg-slate-900 rounded-3xl overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-4 bg-slate-800/50">
                  <p className="text-[11px] font-black text-white uppercase tracking-widest">
                    {webcamTarget === 'pickup' ? 'Pickup Photo' : webcamTarget === 'delivery' ? 'Delivery Photo' : 'Inspection Photo'}
                  </p>
                  <button onClick={closeWebcam} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform">
                    <FiX size={18} />
                  </button>
                </div>
                <div className="relative aspect-[4/3] bg-black">
                  <video
                    ref={(el) => { webcamVideoRef.current = el; if (el && !el.srcObject) startWebcam(); }}
                    autoPlay playsInline muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-6 pointer-events-none">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/40 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/40 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/40 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/40 rounded-br-lg" />
                  </div>
                </div>
                <div className="flex items-center justify-center py-6 bg-slate-800/50">
                  <button onClick={captureWebcamPhoto} className="w-16 h-16 rounded-full bg-white border-4 border-slate-600 flex items-center justify-center active:scale-90 transition-transform shadow-lg">
                    <div className="w-12 h-12 rounded-full bg-white border-2 border-slate-300" />
                  </button>
                </div>
              </motion.div>
              <canvas ref={webcamCanvasRef} className="hidden" />
            </motion.div>
          )}
        </AnimatePresence>

        <CancellationModal
          isOpen={isCancellationModalOpen}
          onClose={() => setIsCancellationModalOpen(false)}
          onConfirm={confirmCancellation}
          isSubmitting={isCancelling}
          reasons={cancellationReasons}
        />
      </div>
    </PageTransition>
  );
};

export default DeliveryOrderDetail;
