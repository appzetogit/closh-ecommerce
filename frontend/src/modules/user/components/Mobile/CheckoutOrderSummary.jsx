import { FiShoppingBag } from "react-icons/fi";
import { formatPrice } from "../../../../shared/utils/helpers";
import { formatVariantLabel, getVariantSignature } from "../../../../shared/utils/variant";

const OrderSummary = ({ itemsByVendor, total, discount, shipping, tax, platformFee = 20, finalTotal, distances }) => {
  return (
    <div className="glass-card rounded-xl p-4">
      <h3 className="text-base font-bold text-gray-800 mb-3">Order Summary</h3>
      <div className="space-y-3 mb-4">
        {itemsByVendor.map((vendorGroup) => (
          <div key={vendorGroup.vendorId} className="space-y-2 mb-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-primary-50 to-primary-100 rounded-lg border border-primary-200/50 shadow-sm">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0">
                <FiShoppingBag className="text-white text-[10px]" />
              </div>
              <span className="text-sm font-bold text-primary-700 flex-1">{vendorGroup.vendorName}</span>
              {distances && distances[vendorGroup.vendorId] && (
                <span className="text-[10px] bg-white/50 px-2 py-0.5 rounded-full text-primary-600 font-medium mr-1">
                  {distances[vendorGroup.vendorId]} km
                </span>
              )}
              <span className="text-xs font-semibold text-primary-600 bg-white px-2 py-0.5 rounded-md">
                {formatPrice(vendorGroup.subtotal)}
              </span>
            </div>
            <div className="space-y-2 pl-2">
              {vendorGroup.items.map((item, itemIndex) => (
                <div
                  key={`${item.id}-${itemIndex}-${getVariantSignature(item?.variant || {})}`}
                  className="flex items-center gap-2 text-xs"
                >
                  <img src={item.image} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate text-xs">{item.name}</p>
                    <p className="text-gray-600 text-xs">
                      {formatPrice(item.price)} x {item.quantity}
                    </p>
                    {formatVariantLabel(item?.variant) && (
                      <p className="text-[11px] text-gray-500">{formatVariantLabel(item?.variant)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Subtotal</span>
          <span>{formatPrice(total)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-green-600 font-medium">
            <span>Discount</span>
            <span>- {formatPrice(Math.abs(discount))}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-600">
          <span>Shipping</span>
          <span>{shipping === 0 ? "FREE" : formatPrice(shipping)}</span>
        </div>
        {/* Tax is inclusive, hidden from summary */}
        <div className="flex justify-between text-gray-600">
          <span>Platform Fee</span>
          <span>{formatPrice(platformFee)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold text-gray-800 pt-2 border-t border-gray-200">
          <span>Total</span>
          <span className="text-primary-600">{formatPrice(finalTotal)}</span>
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;

