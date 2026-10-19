import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import School from "../models/schoolModel.js";
import StallReport from "../models/stallReportModel.js";
import Petition from "../models/petitionModel.js";
import createAdminNotification from "../utils/adminNotifier.js";

// Helper: Haversine Geodesic Distance in Meters
function calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Initial seed data for Maharashtra Cities & Schools
// Initial comprehensive seed data for all 36 Maharashtra Districts
const INITIAL_MAHARASHTRA_SCHOOLS = [
  // Mumbai
  { name: "Bombay Scottish School", city: "Mumbai", address: "Mahim, Mumbai", coordinates: [72.8398, 19.0345] },
  { name: "St. Xavier's High School", city: "Mumbai", address: "Fort, Mumbai", coordinates: [72.8335, 18.9438] },
  { name: "Dhirubhai Ambani International School", city: "Mumbai", address: "BKC, Mumbai", coordinates: [72.8682, 19.0652] },
  { name: "Cathedral & John Connon School", city: "Mumbai", address: "Fort, Mumbai", coordinates: [72.8322, 18.9378] },
  { name: "Don Bosco High School", city: "Mumbai", address: "Matunga, Mumbai", coordinates: [72.8546, 19.0267] },
  { name: "Campion School", city: "Mumbai", address: "Cooperage, Mumbai", coordinates: [72.8272, 18.9272] },

  // Mumbai Suburban
  { name: "Podar International School, Santacruz", city: "Mumbai Suburban", address: "Santacruz West, Mumbai", coordinates: [72.8385, 19.0822] },
  { name: "Ryan International School", city: "Mumbai Suburban", address: "Malad East, Mumbai", coordinates: [72.8485, 19.1865] },
  { name: "Oberoi International School", city: "Mumbai Suburban", address: "Goregaon East, Mumbai", coordinates: [72.8689, 19.1725] },
  { name: "Billabong High International School", city: "Mumbai Suburban", address: "Juhu, Mumbai", coordinates: [72.8285, 19.1098] },

  // Pune
  { name: "Loyola High School", city: "Pune", address: "Pashan, Pune", coordinates: [73.8188, 18.5392] },
  { name: "St. Vincent's High School", city: "Pune", address: "Camp, Pune", coordinates: [73.8765, 18.5134] },
  { name: "The Bishop's School", city: "Pune", address: "Camp, Pune", coordinates: [73.8741, 18.5121] },
  { name: "Fergusson Junior College & School", city: "Pune", address: "FC Road, Pune", coordinates: [73.8398, 18.5228] },
  { name: "Delhi Public School, Pune", city: "Pune", address: "Mohammed Wadi, Pune", coordinates: [73.9185, 18.4725] },
  { name: "Symbiosis International School", city: "Pune", address: "Viman Nagar, Pune", coordinates: [73.9142, 18.5678] },
  { name: "St. Mary's School", city: "Pune", address: "Camp, Pune", coordinates: [73.8821, 18.5085] },

  // Thane
  { name: "Smt. Sulochanadevi Singhania School", city: "Thane", address: "Jekegram, Thane West", coordinates: [72.9642, 19.2065] },
  { name: "Hiranandani Foundation School", city: "Thane", address: "Ghodbunder Road, Thane", coordinates: [72.9781, 19.2482] },
  { name: "DAV Public School", city: "Thane", address: "Thane West", coordinates: [72.9812, 19.2145] },
  { name: "Vasant Vihar High School", city: "Thane", address: "Vasant Vihar, Thane West", coordinates: [72.9698, 19.2215] },

  // Navi Mumbai
  { name: "Delhi Public School, Nerul", city: "Navi Mumbai", address: "Nerul, Navi Mumbai", coordinates: [73.0185, 19.0345] },
  { name: "Father Agnel Multipurpose School", city: "Navi Mumbai", address: "Vashi, Navi Mumbai", coordinates: [72.9985, 19.0765] },
  { name: "Apeejay School", city: "Navi Mumbai", address: "Nerul, Navi Mumbai", coordinates: [73.0152, 19.0412] },
  { name: "Ryan International School, Sanpada", city: "Navi Mumbai", address: "Sanpada, Navi Mumbai", coordinates: [73.0112, 19.0625] },

  // Palghar
  { name: "St. John International School", city: "Palghar", address: "Palghar Manor Road, Palghar", coordinates: [72.7745, 19.7025] },
  { name: "Sacred Heart High School", city: "Palghar", address: "Vevoor, Palghar", coordinates: [72.7812, 19.6985] },
  { name: "Tarapur Vidya Mandir", city: "Palghar", address: "Boisar, Palghar", coordinates: [72.7562, 19.8012] },

  // Vasai / Vasai-Virar
  { name: "Holy Family Convent High School", city: "Vasai", address: "Vasai West", coordinates: [72.8285, 19.3825] },
  { name: "Carmel Convent English High School", city: "Vasai", address: "Sandor, Vasai", coordinates: [72.8145, 19.3765] },
  { name: "St. Aloysius High School", city: "Vasai-Virar", address: "Nallasopara West", coordinates: [72.8195, 19.4125] },

  // Raigad
  { name: "St. Wilfred's High School", city: "Raigad", address: "Panvel, Raigad", coordinates: [73.1125, 18.9925] },
  { name: "DAV Public School, New Panvel", city: "Raigad", address: "New Panvel, Raigad", coordinates: [73.1245, 18.9985] },
  { name: "Shantiniketan Public School", city: "Raigad", address: "Alibag, Raigad", coordinates: [72.8715, 18.6412] },

  // Ratnagiri
  { name: "Phatak High School", city: "Ratnagiri", address: "Ratnagiri City", coordinates: [73.3012, 16.9925] },
  { name: "M.S. Naik High School", city: "Ratnagiri", address: "Patwardhan Wadi, Ratnagiri", coordinates: [73.3125, 16.9845] },
  { name: "Sacred Heart Convent High School", city: "Ratnagiri", address: "Ratnagiri", coordinates: [73.3085, 17.0012] },

  // Sindhudurg
  { name: "Topiwala National High School", city: "Sindhudurg", address: "Sawantwadi, Sindhudurg", coordinates: [73.7512, 15.9085] },
  { name: "Shivaji High School", city: "Sindhudurg", address: "Kudal, Sindhudurg", coordinates: [73.6895, 16.0125] },
  { name: "Rani Parvati Devi High School", city: "Sindhudurg", address: "Sawantwadi", coordinates: [73.7485, 15.9025] },

  // Satara
  { name: "Podar International School, Satara (CBSE)", city: "Satara", address: "Old MIDC, Satara", coordinates: [73.9940, 17.7064] },
  { name: "Sainik School, Satara", city: "Satara", address: "Sadar Bazar, Satara", coordinates: [74.0125, 17.6895] },
  { name: "Chhatrapati Shahu Academy", city: "Satara", address: "Khadgaon Road, Satara", coordinates: [74.0085, 17.6945] },
  { name: "Kanya Shala, Satara", city: "Satara", address: "Bhavani Peth, Satara", coordinates: [74.0185, 17.6812] },

  // Sangli
  { name: "City High School", city: "Sangli", address: "Gaon Bhag, Sangli", coordinates: [74.5712, 16.8545] },
  { name: "Appasaheb Birnale Public School", city: "Sangli", address: "South Shivaji Nagar, Sangli", coordinates: [74.5895, 16.8625] },
  { name: "Alpha English Medium School", city: "Sangli", address: "Miraj Road, Sangli", coordinates: [74.5645, 16.8485] },

  // Kolhapur
  { name: "Chhatrapati Shahu Vidyalaya", city: "Kolhapur", address: "New Palace, Kolhapur", coordinates: [74.2312, 16.7145] },
  { name: "St. Xavier's High School", city: "Kolhapur", address: "Nagala Park, Kolhapur", coordinates: [74.2285, 16.7012] },
  { name: "Private High School", city: "Kolhapur", address: "Mangalwar Peth, Kolhapur", coordinates: [74.2385, 16.6945] },
  { name: "Rajaram High School", city: "Kolhapur", address: "Kasaba Bawada, Kolhapur", coordinates: [74.2485, 16.7085] },

  // Solapur
  { name: "Jain International School", city: "Solapur", address: "NH-9, Solapur", coordinates: [75.9064, 17.6599] },
  { name: "Haribhai Deokaran High School", city: "Solapur", address: "Murarji Peth, Solapur", coordinates: [75.9125, 17.6685] },
  { name: "Siddheshwar English Medium School", city: "Solapur", address: "Solapur City", coordinates: [75.9215, 17.6745] },
  { name: "Kuchan High School", city: "Solapur", address: "Raviwar Peth, Solapur", coordinates: [75.8985, 17.6512] },

  // Nashik
  { name: "Barnes School & Junior College", city: "Nashik", address: "Devlali, Nashik", coordinates: [73.8321, 19.9543] },
  { name: "K.K. Wagh Universal School", city: "Nashik", address: "Panchavati, Nashik", coordinates: [73.8156, 20.0123] },
  { name: "Karmaveer Bhaurao Patil Vidyalaya", city: "Nashik", address: "Nashik", coordinates: [73.7912, 19.9885] },
  { name: "Fravashi Academy", city: "Nashik", address: "Sharanpur Road, Nashik", coordinates: [73.7745, 19.9985] },
  { name: "Wisdom High International School", city: "Nashik", address: "Rameshwar Nagar, Nashik", coordinates: [73.7612, 20.0215] },

  // Dhule
  { name: "Jai Hind High School", city: "Dhule", address: "Deopur, Dhule", coordinates: [74.7785, 20.9012] },
  { name: "Canossa Convent High School", city: "Dhule", address: "Dhule City", coordinates: [74.7812, 20.9085] },
  { name: "Podar International School, Dhule", city: "Dhule", address: "Wadbhokhar Road, Dhule", coordinates: [74.7645, 20.8945] },

  // Jalgaon
  { name: "Anglo Urdu High School", city: "Jalgaon", address: "Polan Peth, Jalgaon", coordinates: [75.5685, 21.0085] },
  { name: "K.R. Kotkar High School", city: "Jalgaon", address: "Navi Peth, Jalgaon", coordinates: [75.5595, 21.0125] },
  { name: "St. Aloysius High School", city: "Jalgaon", address: "Jalgaon City", coordinates: [75.5712, 20.9985] },

  // Nandurbar
  { name: "D.G. Tatkare High School", city: "Nandurbar", address: "Nandurbar City", coordinates: [74.2412, 21.3712] },
  { name: "Eklavya Residential School", city: "Nandurbar", address: "Nandurbar", coordinates: [74.2285, 21.3645] },
  { name: "SA Mission High School", city: "Nandurbar", address: "Mission Compound, Nandurbar", coordinates: [74.2485, 21.3785] },

  // Ahilyanagar / Ahmednagar
  { name: "Bhausaheb Firodiya High School", city: "Ahmednagar", address: "Savedi, Ahmednagar", coordinates: [74.7412, 19.0985] },
  { name: "Sacred Heart Convent High School", city: "Ahmednagar", address: "Camp, Ahmednagar", coordinates: [74.7512, 19.0912] },
  { name: "Residential High School", city: "Ahmednagar", address: "Delhi Gate, Ahmednagar", coordinates: [74.7385, 19.1025] },
  { name: "Podar International School, Ahmednagar", city: "Ahmednagar", address: "Nagar-Pune Road, Ahmednagar", coordinates: [74.7625, 19.0845] },

  // Chhatrapati Sambhajinagar
  { name: "Stepping Stones High School", city: "Chhatrapati Sambhajinagar", address: "Beed Bypass, Sambhajinagar", coordinates: [75.3482, 19.8654] },
  { name: "Nath Valley School", city: "Chhatrapati Sambhajinagar", address: "Paithan Road, Sambhajinagar", coordinates: [75.3125, 19.8412] },
  { name: "Saint Francis De Sales High School", city: "Chhatrapati Sambhajinagar", address: "Jalna Road, Sambhajinagar", coordinates: [75.3585, 19.8785] },
  { name: "Woodridge High School", city: "Chhatrapati Sambhajinagar", address: "CIDCO, Sambhajinagar", coordinates: [75.3712, 19.8845] },
  { name: "Podar International School, CIDCO", city: "Chhatrapati Sambhajinagar", address: "CIDCO N-3, Sambhajinagar", coordinates: [75.3812, 19.8725] },

  // Jalna
  { name: "Matsyodari Vidyalaya", city: "Jalna", address: "Devalgaon Raja Road, Jalna", coordinates: [75.8812, 19.8445] },
  { name: "St. Mary's High School", city: "Jalna", address: "Railway Station Road, Jalna", coordinates: [75.8925, 19.8385] },
  { name: "J.E.S. English School", city: "Jalna", address: "Jalna City", coordinates: [75.8745, 19.8495] },

  // Beed
  { name: "Champavati Vidyalaya", city: "Beed", address: "Jalna Road, Beed", coordinates: [75.7685, 18.9912] },
  { name: "Jawahar Education Society High School", city: "Beed", address: "Beed City", coordinates: [75.7545, 18.9845] },
  { name: "Podar International School, Beed", city: "Beed", address: "Nagar Road, Beed", coordinates: [75.7785, 18.9765] },

  // Latur
  { name: "Deshikendra High School", city: "Latur", address: "Ausa Road, Latur", coordinates: [76.5645, 18.4112] },
  { name: "Keshavraj Vidyalaya", city: "Latur", address: "Tilak Nagar, Latur", coordinates: [76.5712, 18.4045] },
  { name: "Shri Marwadi Rajasthan Vidyalaya", city: "Latur", address: "Latur City", coordinates: [76.5585, 18.4185] },
  { name: "Podar International School, Latur", city: "Latur", address: "Barshi Road, Latur", coordinates: [76.5812, 18.3985] },

  // Dharashiv / Osmanabad
  { name: "Bhalchandra High School", city: "Dharashiv", address: "Dharashiv City", coordinates: [76.0485, 18.1885] },
  { name: "Shri Chhatrapati Shivaji Vidyalaya", city: "Dharashiv", address: "Dharashiv", coordinates: [76.0395, 18.1812] },
  { name: "Ramkrishna Paramhansa High School", city: "Dharashiv", address: "Dharashiv", coordinates: [76.0545, 18.1945] },

  // Nanded
  { name: "Mahatma Jyotirao Phule High School", city: "Nanded", address: "Vazirabad, Nanded", coordinates: [77.3245, 19.1412] },
  { name: "Peoples High School", city: "Nanded", address: "Nanded City", coordinates: [77.3185, 19.1345] },
  { name: "Cambridge English School", city: "Nanded", address: "VIP Road, Nanded", coordinates: [77.3312, 19.1485] },
  { name: "Oxford International School", city: "Nanded", address: "Nanded", coordinates: [77.3112, 19.1285] },

  // Parbhani
  { name: "Shivaji High School", city: "Parbhani", address: "Station Road, Parbhani", coordinates: [76.7785, 19.2645] },
  { name: "Bal Vidya Mandir", city: "Parbhani", address: "Nanak Colony, Parbhani", coordinates: [76.7695, 19.2585] },
  { name: "Podar International School, Parbhani", city: "Parbhani", address: "Jintur Road, Parbhani", coordinates: [76.7845, 19.2712] },

  // Hingoli
  { name: "Adarsh High School", city: "Hingoli", address: "Akola Bypass, Hingoli", coordinates: [77.1512, 19.7212] },
  { name: "National High School", city: "Hingoli", address: "Hingoli City", coordinates: [77.1425, 19.7145] },
  { name: "Podar International School, Hingoli", city: "Hingoli", address: "Nanded Road, Hingoli", coordinates: [77.1585, 19.7285] },

  // Buldhana
  { name: "Prabhat Kids School", city: "Buldhana", address: "Chikhli Road, Buldhana", coordinates: [76.1885, 20.5312] },
  { name: "Bharat Vidyalaya", city: "Buldhana", address: "Buldhana City", coordinates: [76.1795, 20.5245] },
  { name: "Jijamata High School", city: "Buldhana", address: "Buldhana", coordinates: [76.1945, 20.5385] },

  // Akola
  { name: "Mount Carmel High School", city: "Akola", address: "Civil Lines, Akola", coordinates: [77.0125, 20.7045] },
  { name: "Bharat Vidyalaya", city: "Akola", address: "Ramdas Peth, Akola", coordinates: [77.0045, 20.6985] },
  { name: "Holy Cross Convent High School", city: "Akola", address: "Akola City", coordinates: [77.0185, 20.7112] },
  { name: "School of Scholars, Akola", city: "Akola", address: "Kaulkhed, Akola", coordinates: [77.0245, 20.6912] },

  // Washim
  { name: "Rani Laxmibai Vidyalaya", city: "Washim", address: "Washim City", coordinates: [77.1385, 20.1145] },
  { name: "R.A. Arts & Science High School", city: "Washim", address: "Patur Road, Washim", coordinates: [77.1295, 20.1085] },
  { name: "Podar International School, Washim", city: "Washim", address: "Hingoli Road, Washim", coordinates: [77.1445, 20.1212] },

  // Amravati
  { name: "Golden Kids High School", city: "Amravati", address: "Camp, Amravati", coordinates: [77.7845, 20.9412] },
  { name: "Manibai Gujarati High School", city: "Amravati", address: "Amravati City", coordinates: [77.7712, 20.9345] },
  { name: "Holy Cross High School", city: "Amravati", address: "Badnera Road, Amravati", coordinates: [77.7895, 20.9485] },
  { name: "School of Scholars, Amravati", city: "Amravati", address: "Nawathe Plot, Amravati", coordinates: [77.7645, 20.9285] },

  // Yavatmal
  { name: "Anglo Hindi High School", city: "Yavatmal", address: "Yavatmal City", coordinates: [78.1245, 20.3912] },
  { name: "Free Church Girls High School", city: "Yavatmal", address: "Civil Lines, Yavatmal", coordinates: [78.1185, 20.3845] },
  { name: "School of Scholars, Yavatmal", city: "Yavatmal", address: "Darda Nagar, Yavatmal", coordinates: [78.1312, 20.3985] },
  { name: "Podar International School, Yavatmal", city: "Yavatmal", address: "Nagpur Road, Yavatmal", coordinates: [78.1112, 20.3785] },

  // Wardha
  { name: "Agnihotri High School", city: "Wardha", address: "Ramnagar, Wardha", coordinates: [78.6085, 20.7485] },
  { name: "New English High School", city: "Wardha", address: "Civil Lines, Wardha", coordinates: [78.5995, 20.7412] },
  { name: "Bhavan's Lloyd Vidya Niketan", city: "Wardha", address: "Bhugaon Link Road, Wardha", coordinates: [78.6145, 20.7545] },
  { name: "School of Scholars, Wardha", city: "Wardha", address: "Sawangi Meghe, Wardha", coordinates: [78.5912, 20.7345] },

  // Nagpur
  { name: "Centre Point School", city: "Nagpur", address: "Wardhaman Nagar, Nagpur", coordinates: [79.1198, 21.1492] },
  { name: "St. John's High School", city: "Nagpur", address: "Mohan Nagar, Nagpur", coordinates: [79.0834, 21.1612] },
  { name: "Somalwar High School", city: "Nagpur", address: "Ramdaspeth, Nagpur", coordinates: [79.0712, 21.1345] },
  { name: "Bhavan's Bhagwandas Purohit Vidya Mandir", city: "Nagpur", address: "Trimurti Nagar, Nagpur", coordinates: [79.0545, 21.1185] },
  { name: "Sandipani School", city: "Nagpur", address: "Civil Lines, Nagpur", coordinates: [79.0685, 21.1545] },
  { name: "Delhi Public School, Nagpur", city: "Nagpur", address: "Kamptee Road, Nagpur", coordinates: [79.1245, 21.2012] },

  // Bhandara
  { name: "Lal Bahadur Shastri High School", city: "Bhandara", address: "Bhandara City", coordinates: [79.6595, 21.1712] },
  { name: "J.M. Patel School", city: "Bhandara", address: "Khat Road, Bhandara", coordinates: [79.6512, 21.1645] },
  { name: "Nutan Maharashtra High School", city: "Bhandara", address: "Bhandara", coordinates: [79.6645, 21.1785] },

  // Gondia
  { name: "Gujarati National High School", city: "Gondia", address: "Rail Toly, Gondia", coordinates: [79.6595, 21.4645] },
  { name: "Vivek Mandir School", city: "Gondia", address: "Gondia City", coordinates: [80.1912, 21.4585] },
  { name: "Saraswati Vidyalaya", city: "Gondia", address: "Kudwa, Gondia", coordinates: [80.2045, 21.4685] },

  // Chandrapur
  { name: "Carmel Academy", city: "Chandrapur", address: "Bypass Road, Chandrapur", coordinates: [79.3012, 19.9645] },
  { name: "Lokmanya Tilak Vidyalaya", city: "Chandrapur", address: "Ganj Ward, Chandrapur", coordinates: [79.2925, 19.9585] },
  { name: "F.E.S. Girls High School", city: "Chandrapur", address: "Chandrapur City", coordinates: [79.3085, 19.9712] },
  { name: "Mount Fort School", city: "Chandrapur", address: "Ballarpur Road, Chandrapur", coordinates: [79.2845, 19.9512] },

  // Gadchiroli
  { name: "Shivaji High School", city: "Gadchiroli", address: "Gadchiroli City", coordinates: [79.9985, 20.1885] },
  { name: "Carmel High School", city: "Gadchiroli", address: "Chamorshi Road, Gadchiroli", coordinates: [79.9895, 20.1812] },
  { name: "Platinum Jubilee High School", city: "Gadchiroli", address: "Gadchiroli", coordinates: [80.0045, 20.1945] },
];

// Seed schools & deduplicate approved seed records
async function ensureSchoolsSeeded() {
  for (const s of INITIAL_MAHARASHTRA_SCHOOLS) {
    const escapedName = s.name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedCity = s.city.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exists = await School.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      city: { $regex: new RegExp(`^${escapedCity}$`, "i") },
    });

    if (!exists) {
      await School.create({
        name: s.name.trim(),
        city: s.city.trim(),
        state: "Maharashtra",
        address: s.address,
        location: {
          type: "Point",
          coordinates: s.coordinates,
        },
        status: "approved",
        isApproved: true,
      });
    }
  }

  // Only remove duplicates from approved seed schools, never touch pending user requests
  const approvedSchools = await School.find({ status: "approved" });
  const seenKeys = new Set();
  const duplicateIds = [];

  for (const item of approvedSchools) {
    const key = `${item.name.toLowerCase().trim()}_${item.city.toLowerCase().trim()}`;
    if (seenKeys.has(key)) {
      duplicateIds.push(item._id);
    } else {
      seenKeys.add(key);
    }
  }

  if (duplicateIds.length > 0) {
    await School.deleteMany({ _id: { $in: duplicateIds } });
  }
}

// @desc    Get Maharashtra cities
// @route   GET /api/stall-reports/cities
// @access  Public
export const getCities = asyncHandler(async (req, res) => {
  await ensureSchoolsSeeded();
  const filter = { state: "Maharashtra", $or: [{ isApproved: true }, { status: "approved" }, { isApproved: { $exists: false } }] };
  const cities = await School.distinct("city", filter);
  res.status(200).json({ cities: cities.sort() });
});

// @desc    Get schools by city
// @route   GET /api/stall-reports/schools
// @access  Public
export const getSchoolsByCity = asyncHandler(async (req, res) => {
  await ensureSchoolsSeeded();
  const { city } = req.query;
  const filter = { state: "Maharashtra", $or: [{ isApproved: true }, { status: "approved" }, { isApproved: { $exists: false } }] };
  if (city) {
    filter.city = { $regex: new RegExp(`^${city.trim()}$`, "i") };
  }

  const rawSchools = await School.find(filter).sort({ name: 1 });

  // Deduplicate by lowercased name + city
  const uniqueSchools = [];
  const seenKeys = new Set();
  for (const s of rawSchools) {
    const key = `${s.name.toLowerCase().trim()}_${s.city.toLowerCase().trim()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueSchools.push(s);
    }
  }

  res.status(200).json({ schools: uniqueSchools });
});

// @desc    Submit a junk food stall report (Signers only)
// @route   POST /api/stall-reports
// @access  Private (Signer)
export const createStallReport = asyncHandler(async (req, res) => {
  const {
    petitionId,
    city,
    district,
    taluka,
    villageTown,
    landmark,
    schoolId,
    shopName,
    description,
    latitude,
    longitude,
  } = req.body;

  // Get image URLs from uploaded files (Cloudinary) or fallback to body URLs
  const uploadedImages = req.files ? req.files.map((f) => f.path) : [];
  const bodyImages = req.body.images ? (Array.isArray(req.body.images) ? req.body.images : [req.body.images]) : [];
  const images = uploadedImages.length > 0 ? uploadedImages : bodyImages;

  if (!petitionId || !schoolId || !shopName || !latitude || !longitude) {
    res.status(400);
    throw new Error("Please provide petition, school, shop name, and GPS coordinates.");
  }

  const petition = await Petition.findById(petitionId);
  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  // Check if user has signed the petition or is the petition creator
  const isCreator = petition.user && petition.user.toString() === req.user._id.toString();
  const hasSigned = petition.signatures.some(
    (sig) => sig.user.toString() === req.user._id.toString()
  );

  if (!hasSigned && !isCreator) {
    res.status(403);
    throw new Error("Only users who have signed this petition or the petition creator can submit a junk food stall report.");
  }

  let school = null;
  if (mongoose.Types.ObjectId.isValid(schoolId)) {
    school = await School.findById(schoolId);
  }

  // If schoolId is not found (or was a Google Place / custom school), find or auto-link/create it
  if (!school && (req.body.schoolName || schoolId)) {
    const sName = (req.body.schoolName || schoolId).trim();
    school = await School.findOne({
      name: { $regex: new RegExp(`^${sName}$`, "i") },
      city: { $regex: new RegExp(`^${(city || district || "Maharashtra").trim()}$`, "i") },
    });

    if (!school) {
      const sLat = req.body.schoolLatitude ? parseFloat(req.body.schoolLatitude) : parseFloat(latitude);
      const sLng = req.body.schoolLongitude ? parseFloat(req.body.schoolLongitude) : parseFloat(longitude);
      school = await School.create({
        name: sName,
        city: (city || district || "Maharashtra").trim(),
        state: "Maharashtra",
        address: req.body.schoolAddress || (city || district || "Maharashtra").trim(),
        location: {
          type: "Point",
          coordinates: [sLng, sLat],
        },
        status: "approved",
        isApproved: true,
      });
    }
  }

  if (!school) {
    res.status(404);
    throw new Error("Selected school not found");
  }

  const shopLat = parseFloat(latitude);
  const shopLng = parseFloat(longitude);
  const schoolLng = school.location.coordinates[0];
  const schoolLat = school.location.coordinates[1];

  const distanceFromSchoolMeters = calculateDistanceInMeters(
    schoolLat,
    schoolLng,
    shopLat,
    shopLng
  );

  // Generate unique human-readable Grievance ID e.g. GRV-MH-8492
  const randomCode = Math.floor(1000 + Math.random() * 9000);
  const grievanceId = `GRV-MH-${Date.now().toString().slice(-4)}${randomCode}`;

  const stallReport = await StallReport.create({
    petitionId,
    userId: req.user._id,
    city: city || district || school.city,
    district: district || city || school.city,
    taluka: taluka || "",
    villageTown: villageTown || "",
    landmark: landmark || "",
    grievanceId,
    schoolId: school._id,
    shopName,
    description,
    images: Array.isArray(images) ? images : [],
    location: {
      type: "Point",
      coordinates: [shopLng, shopLat],
    },
    distanceFromSchoolMeters,
    status: "pending",
  });

  // Trigger Admin Notification
  createAdminNotification({
    category: "stall_report",
    title: "New Stall Report 🚨",
    message: `Citizen reported "${shopName}" within ${distanceFromSchoolMeters}m of ${school.name}, ${stallReport.city} (${grievanceId})`,
    link: "/dashboard/stall-reports",
    relatedId: stallReport._id,
    meta: {
      shopName,
      schoolName: school.name,
      city: stallReport.city,
      distance: distanceFromSchoolMeters,
      grievanceId,
    },
  });

  res.status(201).json({
    message: "Report submitted successfully! It will be visible once approved by admin.",
    report: stallReport,
  });
});

// @desc    Get logged-in citizen's submitted reports / complaints dashboard
// @route   GET /api/stall-reports/my-reports
// @access  Private
export const getUserStallReports = asyncHandler(async (req, res) => {
  const reports = await StallReport.find({ userId: req.user._id })
    .populate("schoolId", "name city address location")
    .populate("petitionId", "title slug")
    .sort({ createdAt: -1 });

  res.status(200).json({ reports });
});

// @desc    Get approved reports for a petition (and optional city)
// @route   GET /api/stall-reports/approved/:petitionId
// @access  Public
export const getApprovedStallReports = asyncHandler(async (req, res) => {
  const { petitionId } = req.params;
  const { city } = req.query;

  const query = {
    petitionId,
    status: "approved",
  };

  if (city) {
    query.city = { $regex: new RegExp(`^${city.trim()}$`, "i") };
  }

  const reports = await StallReport.find(query)
    .populate("schoolId", "name city address location")
    .populate("userId", "name email profilePicture")
    .sort({ createdAt: -1 });

  res.status(200).json({ reports });
});

// @desc    Admin: Get all stall reports (filterable by status)
// @route   GET /api/stall-reports/admin/reports
// @access  Admin
export const getAdminStallReports = asyncHandler(async (req, res) => {
  const { status, city } = req.query;
  const query = {};

  if (status) query.status = status;
  if (city) query.city = { $regex: new RegExp(`^${city.trim()}$`, "i") };

  const reports = await StallReport.find(query)
    .populate("petitionId", "title slug")
    .populate("schoolId", "name city address location")
    .populate("userId", "name email mobileNumber")
    .sort({ createdAt: -1 });

  res.status(200).json({ reports });
});

// @desc    Admin: Approve stall report
// @route   PUT /api/stall-reports/admin/:id/approve
// @access  Admin
export const approveStallReport = asyncHandler(async (req, res) => {
  const report = await StallReport.findById(req.params.id);
  if (!report) {
    res.status(404);
    throw new Error("Stall report not found");
  }

  report.status = "approved";
  await report.save();

  res.status(200).json({ message: "Stall report approved successfully", report });
});

// @desc    Admin: Reject stall report
// @route   PUT /api/stall-reports/admin/:id/reject
// @access  Admin
export const rejectStallReport = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const report = await StallReport.findById(req.params.id);
  if (!report) {
    res.status(404);
    throw new Error("Stall report not found");
  }

  report.status = "rejected";
  report.rejectionReason = reason || "Invalid report or insufficient evidence.";
  await report.save();

  res.status(200).json({ message: "Stall report rejected", report });
});

// @desc    Admin: Mark stall as closed/removed and restore school as Safe Zone
// @route   PUT /api/stall-reports/admin/:id/resolve
// @access  Admin
export const resolveStallReport = asyncHandler(async (req, res) => {
  const { reason, note } = req.body;
  const report = await StallReport.findById(req.params.id).populate("schoolId", "name city");
  if (!report) {
    res.status(404);
    throw new Error("Stall report not found");
  }

  report.status = "resolved";
  report.resolutionNote = note || reason || "Stall confirmed removed or permanently closed. School zone marked Safe.";
  report.resolvedAt = new Date();
  await report.save();

  res.status(200).json({
    message: "Stall confirmed closed/removed. School zone restored as Safe!",
    report,
  });
});

// @desc    Public: Get resolved stall reports (removed stalls history)
// @route   GET /api/stall-reports/resolved/:petitionId
// @access  Public
export const getResolvedStallReports = asyncHandler(async (req, res) => {
  const { petitionId } = req.params;
  const { city } = req.query;

  const query = {
    status: "resolved",
  };

  if (petitionId && petitionId !== "all") {
    query.petitionId = petitionId;
  }

  if (city) {
    query.city = { $regex: new RegExp(`^${city.trim()}$`, "i") };
  }

  const reports = await StallReport.find(query)
    .populate("schoolId", "name city address location")
    .populate("userId", "name email profilePicture")
    .sort({ resolvedAt: -1, updatedAt: -1 });

  res.status(200).json({ reports });
});

// @desc    Admin: Delete a stall report / resolved stall record
// @route   DELETE /api/stall-reports/admin/:id
// @access  Admin
export const deleteStallReport = asyncHandler(async (req, res) => {
  const report = await StallReport.findById(req.params.id);
  if (!report) {
    res.status(404);
    throw new Error("Stall report not found");
  }

  await report.deleteOne();

  res.status(200).json({
    message: "Stall report record deleted successfully.",
    id: req.params.id,
  });
});

// @desc    Signer: Submit a request for missing city & school
// @route   POST /api/stall-reports/schools/request
// @access  Private (Signer)
export const requestNewSchool = asyncHandler(async (req, res) => {
  const { name, city, address, latitude, longitude } = req.body;

  if (!name || !city) {
    res.status(400);
    throw new Error("Please provide school name and city.");
  }

  const defaultCoords = [75.7139, 19.7515]; // Default Maharashtra center
  let shopLat = latitude ? parseFloat(latitude) : defaultCoords[1];
  let shopLng = longitude ? parseFloat(longitude) : defaultCoords[0];

  if (isNaN(shopLat)) shopLat = defaultCoords[1];
  if (isNaN(shopLng)) shopLng = defaultCoords[0];

  const newSchool = await School.create({
    name: name.trim(),
    city: city.trim(),
    state: "Maharashtra",
    address: address ? address.trim() : city.trim(),
    location: {
      type: "Point",
      coordinates: [shopLng, shopLat],
    },
    status: "pending",
    isApproved: false,
    requestedBy: req.user?._id,
  });

  // Trigger Admin Notification
  createAdminNotification({
    category: "school_request",
    title: "New School Request 🏫",
    message: `Citizen requested addition of school "${newSchool.name}" in ${newSchool.city}`,
    link: "/dashboard/school-requests",
    relatedId: newSchool._id,
    meta: {
      schoolName: newSchool.name,
      city: newSchool.city,
      requestedBy: req.user?.name,
    },
  });

  res.status(201).json({
    message: "School and city request submitted successfully. Admin will review and approve.",
    school: newSchool,
  });
});

// @desc    Admin: Get pending school & city requests
// @route   GET /api/stall-reports/admin/school-requests
// @access  Admin
export const getPendingSchoolRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status && status !== "all") {
    filter.status = status;
  } else if (!status) {
    filter.status = "pending";
  }

  const schools = await School.find(filter)
    .populate("requestedBy", "name email mobileNumber")
    .sort({ createdAt: -1 });

  res.status(200).json({ schools });
});

// @desc    Admin: Approve school & city request (with optional location/details update)
// @route   PUT /api/stall-reports/admin/school-requests/:id/approve
// @access  Admin
export const approveSchoolRequest = asyncHandler(async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) {
    res.status(404);
    throw new Error("School request not found");
  }

  const { name, city, address, latitude, longitude } = req.body || {};

  if (name && name.trim()) school.name = name.trim();
  if (city && city.trim()) school.city = city.trim();
  if (address !== undefined) school.address = address.trim();

  if (latitude !== undefined && longitude !== undefined) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      school.location = {
        type: "Point",
        coordinates: [lng, lat],
      };
    }
  }

  school.status = "approved";
  school.isApproved = true;
  await school.save();

  res.status(200).json({ message: "School and city request approved successfully!", school });
});

// @desc    Admin: Update school details & exact GPS coordinates
// @route   PUT /api/stall-reports/admin/school-requests/:id
// @access  Admin
export const updateSchoolRequest = asyncHandler(async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) {
    res.status(404);
    throw new Error("School request not found");
  }

  const { name, city, address, latitude, longitude, status } = req.body || {};

  if (name && name.trim()) school.name = name.trim();
  if (city && city.trim()) school.city = city.trim();
  if (address !== undefined) school.address = address.trim();

  if (latitude !== undefined && longitude !== undefined) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      school.location = {
        type: "Point",
        coordinates: [lng, lat],
      };
    }
  }

  if (status && ["approved", "pending", "rejected"].includes(status)) {
    school.status = status;
    school.isApproved = status === "approved";
  }

  await school.save();

  res.status(200).json({ message: "School details and exact location updated successfully!", school });
});

// @desc    Admin: Reject school & city request
// @route   PUT /api/stall-reports/admin/school-requests/:id/reject
// @access  Admin
export const rejectSchoolRequest = asyncHandler(async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) {
    res.status(404);
    throw new Error("School request not found");
  }

  school.status = "rejected";
  school.isApproved = false;
  await school.save();

  res.status(200).json({ message: "School request rejected successfully!", school });
});

// @desc    Public / Vendor: Submit a defense/dispute request for a reported stall
// @route   POST /api/stall-reports/:id/defend
// @access  Public
export const submitStallDefense = asyncHandler(async (req, res) => {
  const { vendorName, vendorContact, reason, explanation, newGoogleMapsUrl } = req.body;

  if (!vendorName || !reason || !explanation) {
    res.status(400);
    throw new Error("Please provide vendor name, reason, and explanation.");
  }

  const report = await StallReport.findById(req.params.id);
  if (!report) {
    res.status(404);
    throw new Error("Stall report not found.");
  }

  if (!report.defenses) {
    report.defenses = [];
  }

  report.defenses.push({
    userId: req.user?._id,
    vendorName: vendorName.trim(),
    vendorContact: vendorContact ? vendorContact.trim() : (req.user?.mobileNumber || req.user?.email || ""),
    reason,
    explanation: explanation.trim(),
    newGoogleMapsUrl: newGoogleMapsUrl ? newGoogleMapsUrl.trim() : "",
    status: "pending",
    submittedAt: new Date(),
  });

  await report.save();

  // Trigger Admin Notification
  createAdminNotification({
    category: "stall_dispute",
    title: "New Stall Dispute Defense 🛡️",
    message: `Vendor "${vendorName}" submitted a dispute defense for stall "${report.shopName}" (${report.grievanceId || report.city})`,
    link: "/dashboard/stall-disputes",
    relatedId: report._id,
    meta: {
      vendorName,
      shopName: report.shopName,
      grievanceId: report.grievanceId,
      reason,
    },
  });

  res.status(201).json({
    message: "Your defense/dispute request has been submitted successfully to the admin for review.",
    report,
  });
});

// @desc    Admin: Get all stall reports with vendor defenses/disputes
// @route   GET /api/stall-reports/admin/disputes
// @access  Admin
export const getStallDisputes = asyncHandler(async (req, res) => {
  const reports = await StallReport.find({ "defenses.0": { $exists: true } })
    .populate("schoolId", "name city address")
    .sort({ updatedAt: -1 });

  res.status(200).json({ reports });
});

// @desc    Admin: Resolve or Dismiss a vendor defense/dispute
// @route   PUT /api/stall-reports/admin/disputes/:reportId/:defenseId/resolve
// @access  Admin
export const resolveStallDispute = asyncHandler(async (req, res) => {
  const { action, adminNotes } = req.body; // action: 'approve_resolve' or 'dismiss'
  const { reportId, defenseId } = req.params;

  const report = await StallReport.findById(reportId);
  if (!report) {
    res.status(404);
    throw new Error("Stall report not found.");
  }

  const defense = report.defenses.id(defenseId);
  if (!defense) {
    res.status(404);
    throw new Error("Defense request not found.");
  }

  if (action === "approve_resolve") {
    defense.status = "approved_resolved";
    // Mark the stall report as rejected / resolved so it is no longer flagged as an active violation on map
    report.status = "rejected";
    report.rejectionReason = `Resolved via Vendor Defense: ${defense.reason} - ${adminNotes || "Stall shifted or >50m away"}`;
  } else {
    defense.status = "reviewed_dismissed";
  }

  await report.save();

  res.status(200).json({ message: `Vendor dispute ${action === "approve_resolve" ? "approved & stall report resolved" : "dismissed"}.`, report });
});
