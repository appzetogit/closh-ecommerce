require('dotenv').config();
const mongoose = require('mongoose');
const uri = process.env.MONGO_URI;
mongoose.connect(uri)
  .then(async () => {
    const Product = mongoose.connection.collection('products');
    const Vendor = mongoose.connection.collection('vendors');
    
    const approvedVendors = await Vendor.find({ status: 'approved' }).toArray();
    const approvedVendorIds = approvedVendors.map(v => v._id);
    
    console.log("Total approved vendors:", approvedVendorIds.length);

    const allProducts = await Product.find({}).toArray();
    
    let reasons = {
        isActiveFalse: 0,
        notApproved: 0,
        priceZero: 0,
        vendorNotApproved: 0,
        valid: 0
    };
    
    let divisionCounts = {};
    
    for (const p of allProducts) {
        let valid = true;
        if (!p.isActive) { reasons.isActiveFalse++; valid = false; }
        if (p.approvalStatus !== 'approved') { reasons.notApproved++; valid = false; }
        if (!p.price || p.price <= 0) { reasons.priceZero++; valid = false; }
        
        let hasApprovedVendor = false;
        for (const vid of approvedVendorIds) {
            if (String(vid) === String(p.vendorId)) {
                hasApprovedVendor = true;
                break;
            }
        }
        if (!hasApprovedVendor) { reasons.vendorNotApproved++; valid = false; }
        
        if (valid) reasons.valid++;
        
        const div = p.division || 'Unknown';
        if (!divisionCounts[div]) divisionCounts[div] = { total: 0, valid: 0 };
        divisionCounts[div].total++;
        if (valid) divisionCounts[div].valid++;
    }
    
    console.log("Reasons for exclusion:", reasons);
    console.log("Divisions breakdown:", divisionCounts);
    
    process.exit(0);
  })
  .catch(err => { console.error(err); process.exit(1); });
