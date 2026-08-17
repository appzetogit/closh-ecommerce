import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiDownload, FiPrinter } from "react-icons/fi";
import { motion } from "framer-motion";
import { getOrderById } from "../../services/adminService";
import toast from "react-hot-toast";
import html2pdf from "html2pdf.js";

const Invoice = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      setIsLoading(true);
      try {
        const response = await getOrderById(id);
        const o = response.data;
        // Normalize data
        const normalizedOrder = {
          ...o,
          id: o.orderId || o._id,
          customer: {
            name: o.userId?.name || 'Unknown',
            email: o.userId?.email || '',
            phone: o.userId?.phone || ''
          },
          date: o.createdAt,
          finalTotal: o.total
        };
        setOrder(normalizedOrder);
      } catch (error) {
        toast.error("Order not found");
        console.error("Order fetch error:", error);
        navigate("/admin/orders/all-orders");
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrder();
  }, [id, navigate]);

  if (isLoading || !order) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const generateInvoiceHtml = () => {
    if (!order) return "";

    const items = Array.isArray(order.items) ? order.items : [];
    
    // Calculate totals for Customer Tax Invoice
    let totalGrossAmount = 0;
    let totalDiscountAmount = 0;
    let totalTaxableValue = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalSellingPriceSum = 0;

    const itemsHtml = items.map(item => {
      const qty = item.quantity || 1;
      const mrp = item.originalPrice || item.price || 0;
      const sellingPrice = item.price || 0;
      const totalSellingPrice = sellingPrice * qty;
      const totalMrp = mrp * qty;
      
      const gstRate = sellingPrice <= 2500 ? 5 : 18;
      const cgstRate = gstRate / 2;
      const sgstRate = gstRate / 2;
      const taxableValue = totalSellingPrice / (1 + (gstRate / 100));
      const gstAmount = totalSellingPrice - taxableValue;

      let itemCgst = 0, itemSgst = 0, itemIgst = 0;
      if (order.totalCustomerIgst > 0) {
          itemIgst = gstAmount;
      } else {
          itemCgst = gstAmount / 2;
          itemSgst = gstAmount / 2;
      }
      
      const calculatedTaxableValue = totalSellingPrice - (itemCgst + itemSgst + itemIgst);
      const discount = totalMrp - totalSellingPrice;

      totalGrossAmount += totalMrp;
      totalDiscountAmount += discount;
      totalTaxableValue += calculatedTaxableValue;
      totalCgst += itemCgst;
      totalSgst += itemSgst;
      totalIgst += itemIgst;
      totalSellingPriceSum += totalSellingPrice;

      return `
        <tr>
            <td class="text-left">${item.name} ${item.selectedSize ? `(${item.selectedSize})` : (item.variant && Object.keys(item.variant).length > 0 ? `(${Object.values(item.variant).join(', ')})` : '')}</td>
            <td>${item.hsnCode || item.productId?.hsnCode || item.product?.hsnCode || 'N/A'}</td>
            <td>${mrp.toFixed(2)}</td>
            <td>${qty}</td>
            <td>${totalMrp.toFixed(2)}</td>
            <td>${discount.toFixed(2)}</td>
            <td>${calculatedTaxableValue.toFixed(2)}</td>
            <td>${itemCgst.toFixed(2)}<br><span style="font-size:8px;color:#666;">@${cgstRate}%</span></td>
            <td>${itemSgst.toFixed(2)}<br><span style="font-size:8px;color:#666;">@${sgstRate}%</span></td>
            <td>${itemIgst.toFixed(2)}<br><span style="font-size:8px;color:#666;">@${itemIgst > 0 ? gstRate : 0}%</span></td>
            <td>${totalSellingPrice.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    // Platform Services Invoice calculations
    const shipping = order.shipping || 0;
    const platformFee = order.platformFee || 0;
    const totalPlatformAmount = shipping + platformFee;
    
    const feeTaxable = platformFee / 1.18;
    const feeGst = platformFee - feeTaxable;
    const shipTaxable = shipping / 1.18;
    const shipGst = shipping - shipTaxable;

    let platformItemsHtml = '';
    if (shipping > 0) {
      platformItemsHtml += `
        <tr>
            <td class="text-left">Shipping & Delivery Charges</td>
            <td>996812</td>
            <td>${shipping.toFixed(2)}</td>
            <td>1</td>
            <td>${shipping.toFixed(2)}</td>
            <td>0.00</td>
            <td>${shipTaxable.toFixed(2)}</td>
            <td>${(shipGst/2).toFixed(2)}</td>
            <td>${(shipGst/2).toFixed(2)}</td>
            <td>0.00</td>
            <td>${shipping.toFixed(2)}</td>
        </tr>
      `;
    }
    if (platformFee > 0) {
      platformItemsHtml += `
        <tr>
            <td class="text-left">Platform Convenience Fee</td>
            <td>998311</td>
            <td>${platformFee.toFixed(2)}</td>
            <td>1</td>
            <td>${platformFee.toFixed(2)}</td>
            <td>0.00</td>
            <td>${feeTaxable.toFixed(2)}</td>
            <td>${(feeGst/2).toFixed(2)}</td>
            <td>${(feeGst/2).toFixed(2)}</td>
            <td>0.00</td>
            <td>${platformFee.toFixed(2)}</td>
        </tr>
      `;
    }

    const couponCode = order.couponCode || '';
    const couponDiscount = Number(order.couponDiscount || 0);

    const addr = order.shippingAddress || order.address || {};
    const customerName = order.customer?.name || order.userId?.name || order.guestInfo?.name || '';
    const shippingNameRaw = addr.name || '';
    const displayShippingName = ['home', 'work', 'other'].includes(shippingNameRaw.toLowerCase()) ? customerName : (shippingNameRaw || customerName);

    const addressHtml = `
      <div>${displayShippingName}</div>
      <div>${addr.address || ''} ${addr.locality ? ', ' + addr.locality : ''}</div>
      <div>${addr.city || ''}, ${addr.state || ''} - ${addr.zipCode || addr.pincode || ''}</div>
    `;

    // Calculate vendor details (defaulting to the first vendor if multiple)
    const primaryVendor = order.vendorItems && order.vendorItems.length > 0 
        ? (order.vendorItems[0].vendorId || {}) 
        : {};
    const vendorNameStr = primaryVendor.storeName || primaryVendor.shopName || order.vendorItems?.[0]?.vendorName || 'CLOSH COMMERCE (OPC) PRIVATE LIMITED';
    const vendorGstinStr = primaryVendor.gstNumber || '08AANCC7176M1ZV';
    const vendorAddressStr = primaryVendor.shopAddress || '70, keshar vihar, Near Railway Colony, Jagatpura, Jaipur, Rajasthan 302017';

    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Invoice #${order.id}</title>
          <style>
              * { box-sizing: border-box; }
              body { font-family: Arial, sans-serif; padding: 20px; max-width: 1000px; margin: 0 auto; color: #000; line-height: 1.4; font-size: 12px; }
              .header-title { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 5px; }
              .top-section { display: flex; justify-content: space-between; margin-bottom: 20px; }
              .sold-by-info { width: 60%; }
              .invoice-info { width: 35%; text-align: right; }
              .info-text { margin-bottom: 5px; }
              .bold { font-weight: bold; }
              
              .addresses-box { border: 1px solid #000; display: flex; margin-bottom: 20px; }
              .address-col { padding: 10px; flex: 1; border-right: 1px solid #000; }
              .address-col:last-child { border-right: none; }
              .address-title { font-weight: bold; margin-bottom: 10px; }
              
              .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; text-align: center; border: 1px solid #000; }
              .table th { border: 1px solid #000; padding: 8px 4px; font-size: 11px; font-weight: bold; }
              .table td { border: 1px solid #000; padding: 8px 4px; font-size: 11px; vertical-align: middle; }
              .table .text-left { text-align: left; }
              .table .text-right { text-align: right; }
              
              .totals-row td { font-weight: bold; border-top: 2px solid #000; }
              .grand-total-row td { font-weight: bold; font-size: 14px; border-top: 2px solid #000; }
              
              .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #555; border-top: 1px solid #000; padding-top: 10px; }
              
              .page-break { page-break-after: always; margin-bottom: 40px; border-bottom: 2px dashed #ccc; padding-bottom: 40px; }
              
              @media print {
                  body { padding: 0; max-width: 100%; }
                  .page-break { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
              }
          </style>
      </head>
      <body>
          <!-- CUSTOMER TAX INVOICE -->
          <div class="header-title">Tax Invoice</div>
          
          <div class="top-section">
              <div class="sold-by-info">
                  <div class="info-text"><span class="bold">Sold By:</span> ${vendorNameStr}</div>
                  <div class="info-text"><span class="bold">GSTIN:</span> ${vendorGstinStr}</div>
                  <div class="info-text"><span class="bold">Ship-from Address:</span> ${vendorAddressStr}</div>
              </div>
              <div class="invoice-info">
                  <div class="info-text"><span class="bold">Invoice Number:</span> INV-${order.id}</div>
              </div>
          </div>

          <div class="addresses-box">
              <div class="address-col" style="flex: 1.2;">
                  <div class="info-text"><span class="bold">Order ID:</span> #${order.id}</div>
                  <div class="info-text"><span class="bold">Order Date:</span> ${new Date(order.date).toLocaleDateString('en-CA')}</div>
                  <div class="info-text"><span class="bold">Invoice Date:</span> ${new Date().toLocaleDateString('en-CA')}</div>
              </div>
              <div class="address-col" style="flex: 1;">
                  <div class="address-title">Billing To:</div>
                  ${addressHtml}
              </div>
              <div class="address-col" style="flex: 1;">
                  <div class="address-title">Shipping To:</div>
                  ${addressHtml}
              </div>
          </div>

          <table class="table">
              <thead>
                  <tr>
                      <th class="text-left" style="width: 25%;">Product</th>
                      <th>HSN</th>
                      <th>MRP</th>
                      <th>Qty</th>
                      <th>Gross Amount</th>
                      <th>Discount</th>
                      <th>Taxable Value</th>
                      <th>CGST</th>
                      <th>SGST/UTGST</th>
                      <th>IGST</th>
                      <th>Total</th>
                  </tr>
              </thead>
              <tbody>
                  ${itemsHtml}
                  <tr class="totals-row">
                      <td colspan="7" class="text-right">Total</td>
                      <td>${totalCgst.toFixed(2)}</td>
                      <td>${totalSgst.toFixed(2)}</td>
                      <td>${totalIgst.toFixed(2)}</td>
                      <td>${totalSellingPriceSum.toFixed(2)}</td>
                  </tr>
                  ${couponCode && couponDiscount > 0 ? `
                  <tr>
                      <td colspan="10" class="text-right">Coupon Applied (${couponCode})</td>
                      <td>-${couponDiscount.toFixed(2)}</td>
                  </tr>
                  ` : ''}
                  <tr class="grand-total-row">
                      <td colspan="10" class="text-right">Grand Total</td>
                      <td>${(totalSellingPriceSum - couponDiscount).toFixed(2)}</td>
                  </tr>
              </tbody>
          </table>

          <div class="footer">
              <p class="bold" style="color: #000; font-size: 12px; margin-bottom: 5px;">This is a computer generated invoice and does not require a signature.</p>
          </div>

          ${totalPlatformAmount > 0 ? `
          <div class="page-break"></div>

          <!-- PLATFORM SERVICES TAX INVOICE -->
          <div class="header-title">Platform Services Tax Invoice</div>
          
          <div class="top-section">
              <div class="sold-by-info">
                  <div class="info-text"><span class="bold">Billed From:</span> CLOSH COMMERCE (OPC) PRIVATE LIMITED</div>
                  <div class="info-text"><span class="bold">GSTIN:</span> 08AANCC7176M1ZV</div>
                  <div class="info-text"><span class="bold">Address:</span> 70, keshar vihar, Near Railway Colony, Jagatpura, Jaipur, Rajasthan 302017</div>
              </div>
              <div class="invoice-info">
                  <div class="info-text"><span class="bold">Invoice Number:</span> TX-${order.id}</div>
              </div>
          </div>

          <div class="addresses-box">
              <div class="address-col" style="flex: 1.2;">
                  <div class="info-text"><span class="bold">Order ID:</span> #${order.id}</div>
                  <div class="info-text"><span class="bold">Order Date:</span> ${new Date(order.date).toLocaleDateString('en-CA')}</div>
                  <div class="info-text"><span class="bold">Invoice Date:</span> ${new Date().toLocaleDateString('en-CA')}</div>
              </div>
              <div class="address-col" style="flex: 1;">
                  <div class="address-title">Billed To (Customer):</div>
                  ${addressHtml}
              </div>
          </div>

          <table class="table">
              <thead>
                  <tr>
                      <th class="text-left" style="width: 25%;">Service Description</th>
                      <th>SAC</th>
                      <th>Amount</th>
                      <th>Qty</th>
                      <th>Gross Amount</th>
                      <th>Discount</th>
                      <th>Taxable Value</th>
                      <th>CGST (9%)</th>
                      <th>SGST (9%)</th>
                      <th>IGST</th>
                      <th>Total</th>
                  </tr>
              </thead>
              <tbody>
                  ${platformItemsHtml}
                  <tr class="totals-row">
                      <td colspan="7" class="text-right">Total</td>
                      <td>${(feeGst/2).toFixed(2)}</td>
                      <td>${(feeGst/2).toFixed(2)}</td>
                      <td>0.00</td>
                      <td>${totalPlatformAmount.toFixed(2)}</td>
                  </tr>
                  <tr class="grand-total-row">
                      <td colspan="10" class="text-right">Grand Total (GST Inclusive)</td>
                      <td>${totalPlatformAmount.toFixed(2)}</td>
                  </tr>
              </tbody>
          </table>

          <div class="footer">
              <p class="bold" style="color: #000; font-size: 12px; margin-bottom: 5px;">This is a computer generated invoice and does not require a signature.</p>
          </div>
          ` : ''}

      </body>
      </html>
    `;
  };

  const handleDownload = () => {
    const iframe = document.getElementById('invoice-iframe');
    if (!iframe || !iframe.contentWindow) {
      toast.error("Invoice not ready yet");
      return;
    }
    
    const element = iframe.contentWindow.document.documentElement;
    
    const opt = {
      margin:       0.3,
      filename:     `invoice-${order.id}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save().then(() => {
        toast.success("Invoice PDF downloaded successfully!");
    }).catch(err => {
        console.error("PDF generation failed:", err);
        toast.error("Failed to download PDF");
    });
  };

  const handlePrint = () => {
    const iframe = document.getElementById('invoice-iframe');
    if (iframe) {
      iframe.contentWindow.print();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 shrink-0">
        <div className="flex items-center justify-between bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <FiArrowLeft className="text-lg text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
                Invoice
              </h1>
              <p className="text-xs text-gray-500">Order #{order.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold">
              <FiDownload />
              Download PDF
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold">
              <FiPrinter />
              Print
            </button>
          </div>
        </div>
      </motion.div>

      {/* Invoice Iframe Content */}
      <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <iframe
          id="invoice-iframe"
          title="Invoice Preview"
          srcDoc={generateInvoiceHtml()}
          className="w-full h-full"
          style={{ border: 'none' }}
        />
      </div>
    </div>
  );
};

export default Invoice;
