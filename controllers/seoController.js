import axios from "axios";

/**
 * Helper to fetch autocomplete suggestions from SerpApi
 */
const getAutocompleteResults = async (query, country, language, apiKey) => {
  try {
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google_autocomplete",
        q: query,
        gl: country,
        hl: language,
        api_key: apiKey,
      },
    });

    if (response.data?.suggestions) {
      return response.data.suggestions.map((el) => el.value);
    }
    return [];
  } catch (error) {
    console.error("Autocomplete scrape failed:", error.message);
    return [];
  }
};

/**
 * Helper to fetch People Also Ask questions (with depth expansion) and Related Searches
 */
const getPaaAndRelatedSearches = async (query, domain, country, language, depthLimit, apiKey) => {
  const peopleAlsoAsk = [];
  let relatedSearches = [];

  try {
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google",
        q: query,
        google_domain: domain,
        gl: country,
        hl: language,
        api_key: apiKey,
      },
    });

    const results = response.data;
    
    // Extract related searches
    if (results?.related_searches) {
      relatedSearches = results.related_searches.map((el) => el.query);
    }

    // Extract People Also Ask questions
    if (results?.related_questions) {
      peopleAlsoAsk.push(...results.related_questions.map((el) => el.question));

      // Handle depth expansion (up to 3 levels)
      if (depthLimit > 1) {
        const getDepthResults = async (token, currentDepth) => {
          try {
            const depthResponse = await axios.get("https://serpapi.com/search.json", {
              params: {
                engine: "google_related_questions",
                next_page_token: token,
                api_key: apiKey,
              },
            });

            const depthResults = depthResponse.data;
            if (depthResults?.related_questions && currentDepth < depthLimit) {
              for (const question of depthResults.related_questions) {
                if (!peopleAlsoAsk.includes(question.question)) {
                  peopleAlsoAsk.push(question.question);
                }
                if (question.next_page_token) {
                  // Recursively fetch next depth
                  await getDepthResults(question.next_page_token, currentDepth + 1);
                }
              }
            }
          } catch (depthErr) {
            console.error("Failed to fetch PAA depth results:", depthErr.message);
          }
        };

        // Trigger depth queries for each initial question
        for (const question of results.related_questions) {
          if (question.next_page_token) {
            await getDepthResults(question.next_page_token, 1); // Depth 1 already obtained, start level 2
          }
        }
      }
    }
  } catch (error) {
    console.error("PAA/Related searches scrape failed:", error.message);
  }

  return { peopleAlsoAsk, relatedSearches };
};

/**
 * Generate SEO Keywords from Google Autocomplete, People Also Ask, and Related Searches
 * POST /api/admin/seo-keywords
 * Protected (Admin only)
 */
export const getSeoKeywords = async (req, res) => {
  try {
    const {
      query,
      engines = ["ac", "paa", "rs"],
      domain = "google.com",
      country = "us",
      language = "en",
      depthLimit = 1,
      apiKey,
    } = req.body;

    if (!query || typeof query !== "string" || query.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Search query is required.",
      });
    }

    const finalApiKey = apiKey || process.env.SERPAPI_API_KEY || process.env.API_KEY;

    if (!finalApiKey) {
      return res.status(400).json({
        success: false,
        message: "SerpApi API key is required. Please register at serpapi.com to get a free key, and enter it in the input field.",
      });
    }

    const validEngines = ["ac", "paa", "rs"];
    const selectedEngines = engines.filter((eng) => validEngines.includes(eng));

    if (selectedEngines.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one valid engine ('ac', 'paa', 'rs') must be selected.",
      });
    }

    const parsedDepthLimit = Math.max(1, Math.min(3, parseInt(depthLimit) || 1));
    const results = {
      autocomplete: [],
      people_also_ask: [],
      related_searches: [],
    };

    // 1. Fetch autocomplete if selected
    if (selectedEngines.includes("ac")) {
      results.autocomplete = await getAutocompleteResults(
        query.trim(),
        country || "us",
        language || "en",
        finalApiKey
      );
    }

    // 2. Fetch PAA or Related Searches if selected
    if (selectedEngines.includes("paa") || selectedEngines.includes("rs")) {
      const paaData = await getPaaAndRelatedSearches(
        query.trim(),
        domain || "google.com",
        country || "us",
        language || "en",
        parsedDepthLimit,
        finalApiKey
      );

      if (selectedEngines.includes("paa")) {
        results.people_also_ask = paaData.peopleAlsoAsk;
      }
      if (selectedEngines.includes("rs")) {
        results.related_searches = paaData.relatedSearches;
      }
    }

    return res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("SEO Keywords generation error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate SEO keywords. Please verify your SerpApi key and try again.",
    });
  }
};
