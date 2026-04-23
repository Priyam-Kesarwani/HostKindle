const geocodeLocation = async (locationText) => {
  if (!locationText || typeof locationText !== "string" || locationText.trim() === "") {
    return null;
  }

  const query = locationText.trim().toLowerCase().includes("india")
    ? locationText.trim()
    : `${locationText.trim()}, India`;
  const encoded = encodeURIComponent(query);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=in&accept-language=en&q=${encoded}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "HostKindle/1.0 (development geocoding)",
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const hit = data[0];
    const countryCode = hit && hit.address ? String(hit.address.country_code || "").toLowerCase() : "";
    if (countryCode && countryCode !== "in") return null;

    const lat = Number.parseFloat(hit.lat);
    const lng = Number.parseFloat(hit.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    return { lat, lng };
  } catch (error) {
    console.error("Geocoding failed:", error);
    return null;
  }
};

module.exports = { geocodeLocation };

