# Hand-made sector decisions for GFF 2026 partners.
#
# Every entry was written after reading that partner's own evidence in
# partners-2026.json (whatTheyDo text, useCases list, partner tier). Nothing here
# is derived from the company name or from outside knowledge of the company.
#
# Format: "<exact partner name>": (sector, [subSectors], confidence, basis)
#   basis "wtd"  -> classified from the whatTheyDo text (useCases, when present,
#                   corroborated it and contributed subSectors)
#   basis "uc"   -> classified from the useCases list alone
#   basis "tier" -> classified from the partner-tier label alone, because the tier
#                   names a concrete business line (e.g. "Payment Processing Partner")
#
# Partners absent from this table are emitted as Unknown / confidence low.
# The build script fails loudly on names that do not exist in the source file, and
# on subSectors that are not registered in taxonomy.json.

DECISIONS = {
    # ---- payments ----
    "Google Pay": ("Payments", ["consumer-payments", "upi"], "high", "wtd"),
    "PhonePe": ("Payments", ["consumer-payments", "upi", "merchant-payments", "bill-payments"], "high", "wtd"),
    "Amazon Pay": ("Payments", ["consumer-payments", "upi"], "high", "wtd"),
    "Paytm": ("Payments", ["consumer-payments", "upi", "merchant-acquiring", "bill-payments"], "high", "wtd"),
    "Visa": ("Payments", ["card-networks", "card-issuing", "card-acceptance", "cross-border-payments"], "high", "wtd"),
    "Mastercard": ("Payments", ["card-networks", "card-issuing", "card-acceptance", "cross-border-payments"], "high", "wtd"),
    "Discover": ("Payments", ["card-networks", "card-issuing", "card-acceptance"], "high", "wtd"),
    "Lyra": ("Payments", ["payment-gateway", "payment-security"], "high", "wtd"),
    "Pine Labs": ("Payments", ["pos-acceptance", "merchant-payments", "card-acceptance"], "high", "wtd"),
    "Adyen": ("Payments", ["payment-processing", "merchant-acquiring", "money-movement"], "high", "wtd"),
    "PayU": ("Payments", ["payment-gateway", "merchant-acquiring", "upi"], "high", "wtd"),
    "BharatPe": ("Payments", ["merchant-payments", "upi", "merchant-lending"], "high", "wtd"),
    "Unlimit": ("Payments", ["payment-gateway", "merchant-acquiring", "upi"], "high", "wtd"),
    "Stripe": ("Payments", ["payment-gateway", "subscription-billing", "money-movement"], "high", "wtd"),
    "Mindgate": ("Payments", ["payments-infrastructure", "payment-processing"], "high", "wtd"),
    "In-Solutions Global": ("Payments", ["payments-infrastructure", "payment-processing"], "high", "wtd"),
    "Razorpay": ("Payments", ["payment-gateway", "payouts", "subscription-billing", "business-banking"], "high", "wtd"),
    "Hitachi Payments": ("Payments", ["payments-infrastructure", "payment-processing"], "high", "wtd"),
    "Vampay": ("Payments", ["payment-processing", "reconciliation", "settlements"], "high", "wtd"),
    "Scapia": ("Payments", ["credit-cards", "travel-rewards"], "high", "wtd"),
    "CamsPay": ("Payments", ["payment-gateway", "payments-infrastructure"], "high", "wtd"),
    "Crunchfish Digital Cash": ("Payments", ["offline-payments", "payments-infrastructure"], "high", "wtd"),
    "InstantPay": ("Payments", ["payouts", "payment-processing"], "high", "wtd"),
    "Payhuddle": ("Payments", ["emv-certification", "payments-testing"], "high", "wtd"),
    "Yalamanchili": ("Payments", ["card-issuing", "merchant-acquiring", "prepaid", "payments-infrastructure"], "high", "wtd"),
    "BNPRS": ("Payments", ["mpos", "biometric-payments", "payments-infrastructure"], "medium", "wtd"),
    "Getepay": ("Payments", ["omnichannel-payments"], "medium", "tier"),
    "86400": ("Payments", ["payment-processing"], "medium", "tier"),

    # ---- cross-border & FX ----
    "Wizzmoni FInancial Services": ("Cross-Border & FX", ["forex", "remittances", "travel-money"], "high", "wtd"),
    "Borderless": ("Cross-Border & FX", ["cross-border-payments", "multicurrency-accounts"], "high", "wtd"),

    # ---- lending & credit ----
    "Tata Capital": ("Lending & Credit", ["nbfc", "retail-lending", "business-loans"], "high", "wtd"),
    "InCred": ("Lending & Credit", ["nbfc", "personal-loans", "education-loans", "business-loans"], "high", "wtd"),
    "Fibe": ("Lending & Credit", ["consumer-lending", "personal-loans"], "high", "wtd"),
    "Vivifi": ("Lending & Credit", ["nbfc", "personal-credit-line", "consumer-lending"], "high", "wtd"),
    "Credit Saison": ("Lending & Credit", ["nbfc", "financial-inclusion"], "medium", "wtd"),
    "BASIC home loan": ("Lending & Credit", ["home-loans", "loan-marketplace"], "high", "wtd"),
    "Interestng": ("Lending & Credit", ["loan-marketplace"], "high", "wtd"),
    "AllCloud Enterprise Solutions": ("Lending & Credit", ["lending-software", "loan-origination"], "high", "wtd"),
    "Credility": ("Lending & Credit", ["lending-software", "loan-origination", "collections-recovery"], "high", "wtd"),
    "Craft AI": ("Lending & Credit", ["lending-software", "loan-origination", "collections-recovery", "ai-agents"], "high", "wtd"),
    "Rahi Technologies": ("Lending & Credit", ["lending-software", "loan-servicing", "collections-recovery"], "high", "wtd"),
    "Scienaptic": ("Lending & Credit", ["credit-decisioning", "underwriting-software"], "high", "wtd"),
    "CredResolve": ("Lending & Credit", ["collections-recovery"], "high", "wtd"),
    "Vayana": ("Lending & Credit", ["trade-finance", "supply-chain-finance"], "high", "wtd"),
    "Nucleus Software": ("Lending & Credit", ["lending-software", "transaction-banking", "core-banking"], "high", "wtd"),
    "ScoreMe": ("Lending & Credit", ["autonomous-lending"], "medium", "tier"),

    # ---- credit bureau & risk scoring ----
    "Experian": ("Credit Bureau & Risk Scoring", ["credit-bureau", "credit-data", "fraud-detection"], "high", "wtd"),
    "Transunion CIBIL": ("Credit Bureau & Risk Scoring", ["credit-insights", "credit-data"], "medium", "tier"),

    # ---- banks & FIs ----
    "HDFC": ("Banking & Financial Institutions", ["private-sector-bank", "retail-banking", "digital-lending", "wealth-management"], "high", "wtd"),
    "State Bank of India": ("Banking & Financial Institutions", ["public-sector-bank", "retail-banking", "digital-lending"], "high", "wtd"),
    "Punjab National Bank": ("Banking & Financial Institutions", ["public-sector-bank", "retail-banking"], "high", "wtd"),
    "Bank of Baroda": ("Banking & Financial Institutions", ["public-sector-bank", "retail-banking", "digital-lending"], "high", "wtd"),
    "HSBC": ("Banking & Financial Institutions", ["corporate-banking", "trade-finance", "treasury-services"], "high", "wtd"),
    "Citi": ("Banking & Financial Institutions", ["corporate-banking", "treasury-services"], "high", "wtd"),
    "Canara Bank": ("Banking & Financial Institutions", ["public-sector-bank", "retail-banking", "corporate-banking", "digital-lending"], "high", "wtd"),
    "City Union Bank": ("Banking & Financial Institutions", ["retail-banking", "digital-lending"], "high", "wtd"),
    "NABARD": ("Banking & Financial Institutions", ["development-finance", "rural-finance", "financial-inclusion"], "high", "wtd"),

    # ---- banking infrastructure ----
    "IserveU": ("Banking Infrastructure & Core Systems", ["banking-infrastructure", "banking-as-a-service"], "high", "wtd"),
    "Blostem": ("Banking Infrastructure & Core Systems", ["banking-as-a-service", "embedded-finance", "banking-apis"], "high", "wtd"),
    "Craftsilicon": ("Banking Infrastructure & Core Systems", ["core-banking", "lending-software", "microfinance-software"], "high", "wtd"),
    "Netwin": ("Banking Infrastructure & Core Systems", ["digital-banking-software"], "medium", "wtd"),
    "Digikhata": ("Banking Infrastructure & Core Systems", ["agent-banking", "business-correspondent", "financial-inclusion"], "medium", "wtd"),

    # ---- wealth & capital markets ----
    "IndiaBonds": ("Wealth & Capital Markets", ["bond-platform", "fixed-income", "retail-investing"], "high", "wtd"),
    "BSE Limited.": ("Wealth & Capital Markets", ["stock-exchange", "equity-trading", "listing", "market-data"], "high", "wtd"),
    "National Stock Exchange": ("Wealth & Capital Markets", ["stock-exchange", "equity-trading", "derivatives", "market-data"], "high", "wtd"),
    "MCX": ("Wealth & Capital Markets", ["commodity-exchange", "derivatives", "price-discovery"], "high", "wtd"),
    "CDSL": ("Wealth & Capital Markets", ["securities-depository", "market-infrastructure"], "high", "wtd"),
    "NSDL": ("Wealth & Capital Markets", ["securities-depository", "demat"], "high", "wtd"),
    "KFin Technologies": ("Wealth & Capital Markets", ["registrar-transfer-agent", "mutual-funds", "market-infrastructure"], "high", "wtd"),
    "LXME": ("Wealth & Capital Markets", ["retail-investing", "mutual-funds", "digital-gold"], "high", "wtd"),
    "Precize": ("Wealth & Capital Markets", ["unlisted-shares", "pre-ipo", "retail-investing"], "high", "wtd"),
    "Simplifin AI": ("Wealth & Capital Markets", ["financial-planning", "mutual-funds", "robo-advisory"], "high", "wtd"),
    "Safebox": ("Wealth & Capital Markets", ["financial-record-keeping", "estate-planning"], "high", "wtd"),
    "Premier Financial Services": ("Wealth & Capital Markets", ["trust-and-fiduciary", "tax-advisory", "wealth-management"], "medium", "wtd"),

    # ---- diversified ----
    "Raise": ("Diversified Financial Services", ["diversified-financial-group", "investing", "wealth-management", "asset-management", "insurance-distribution", "financing", "payments"], "high", "wtd"),
    "Alankit": ("Diversified Financial Services", ["e-governance", "financial-services", "insurance-distribution"], "medium", "wtd"),

    # ---- insurance ----
    "CHUBB": ("Insurance & Insurtech", ["insurance-carrier", "general-insurance"], "high", "wtd"),
    "Onsurity": ("Insurance & Insurtech", ["health-insurance", "group-insurance", "insurance-distribution"], "high", "wtd"),
    "InsureMO": ("Insurance & Insurtech", ["insurance-infrastructure", "insurance-apis"], "high", "wtd"),
    "Mitigata": ("Insurance & Insurtech", ["cyber-insurance"], "low", "tier"),

    # ---- regtech & compliance ----
    "Cleartax.ai": ("RegTech & Compliance", ["tax-compliance", "gst", "e-invoicing"], "high", "wtd"),
    "OnFinance": ("RegTech & Compliance", ["regulatory-ai", "compliance-automation"], "high", "wtd"),
    "Selkea": ("RegTech & Compliance", ["regulatory-ai", "compliance-automation"], "high", "wtd"),
    "Scrut Automation": ("RegTech & Compliance", ["grc", "security-compliance", "vendor-risk"], "high", "wtd"),
    "Leegality": ("RegTech & Compliance", ["esign", "estamp", "legaltech", "document-automation"], "high", "wtd"),
    "Presolv360": ("RegTech & Compliance", ["dispute-resolution", "legaltech"], "high", "wtd"),
    "LEINow by Bundesanzeiger Verlag GmbH": ("RegTech & Compliance", ["regulatory-publishing"], "low", "wtd"),
    "Digio": ("RegTech & Compliance", ["data-protection", "consent-management"], "medium", "tier"),

    # ---- fraud & risk ----
    "Canso.AI": ("Fraud Prevention & Risk", ["fraud-detection", "risk-management"], "high", "wtd"),
    "Zoven": ("Fraud Prevention & Risk", ["merchant-risk", "transaction-monitoring", "fraud-detection"], "high", "wtd"),
    "Modus AI": ("Fraud Prevention & Risk", ["merchant-monitoring", "fraud-detection", "due-diligence"], "high", "wtd"),
    "Mfilterit": ("Fraud Prevention & Risk", ["ad-fraud", "brand-protection", "scam-detection"], "high", "wtd"),

    # ---- identity & KYC ----
    "Signzy": ("Identity & KYC", ["kyc", "kyb", "onboarding", "aml-screening"], "high", "wtd"),
    "Sumsub": ("Identity & KYC", ["identity-verification", "kyb", "fraud-detection"], "high", "wtd"),
    "Gridlines by OnGrid": ("Identity & KYC", ["video-kyc", "identity-verification", "esign", "onboarding", "fraud-detection"], "high", "wtd"),
    "Surepass Technologies": ("Identity & KYC", ["kyc", "identity-verification", "onboarding", "background-verification"], "high", "wtd"),
    "Timble Tech": ("Identity & KYC", ["kyc", "background-verification", "dpdp-compliance", "fraud-detection"], "high", "wtd"),
    "Truecaller": ("Identity & KYC", ["caller-identity", "fraud-detection"], "high", "wtd"),
    "Aadhaar": ("Identity & KYC", ["digital-identity", "government-identity"], "medium", "wtd"),

    # ---- cybersecurity ----
    "Cy5.io": ("Cybersecurity", ["cloud-security", "cnapp", "threat-detection"], "high", "wtd"),
    "Finlock": ("Cybersecurity", ["zero-trust", "cloud-security"], "high", "wtd"),
    "Odyssey": ("Cybersecurity", ["pki", "digital-signatures", "encryption"], "high", "wtd"),
    "X Biz Techventures": ("Cybersecurity", ["ai-security", "red-teaming", "penetration-testing"], "high", "wtd"),
    "Protectt.ai Labs": ("Cybersecurity", ["mobile-app-security"], "medium", "tier"),

    # ---- AI & automation ----
    "Eleven Labs": ("AI & Automation", ["voice-ai", "speech-synthesis", "developer-apis"], "high", "wtd"),
    "Blue Machines AI": ("AI & Automation", ["voice-ai", "agentic-ai"], "high", "wtd"),
    "Nugget by Zomato": ("AI & Automation", ["customer-support-ai", "voice-ai", "ai-agents"], "high", "wtd"),
    "Navanatech AI": ("AI & Automation", ["voice-ai", "speech-recognition"], "high", "wtd"),
    "Gnani.ai": ("AI & Automation", ["voice-ai", "speech-analytics", "voice-biometrics"], "high", "wtd"),
    "ArrowHead": ("AI & Automation", ["voice-ai", "ai-agents"], "high", "wtd"),
    "Smallest.ai": ("AI & Automation", ["voice-ai"], "medium", "wtd"),
    "Automation Edge": ("AI & Automation", ["agentic-ai", "rpa", "document-ai", "workflow-automation"], "high", "wtd"),
    "Melento": ("AI & Automation", ["document-automation"], "medium", "wtd"),
    "Nogrunt": ("AI & Automation", ["ai-agents", "software-testing"], "high", "wtd"),
    "Skan.ai": ("AI & Automation", ["process-intelligence"], "high", "wtd"),
    "Data Science Wizards": ("AI & Automation", ["ai-platform", "mlops"], "medium", "wtd"),
    "Aska Technologies": ("AI & Automation", ["ai-platform", "govtech"], "medium", "wtd"),
    "Invincible Ocean": ("AI & Automation", ["ai-platform", "blockchain-infrastructure"], "medium", "wtd"),

    # ---- data & analytics ----
    "Perfios": ("Data & Analytics", ["financial-data-analytics", "credit-underwriting", "income-verification"], "high", "wtd"),
    "Digitap.AI": ("Data & Analytics", ["financial-data-analytics", "credit-underwriting", "onboarding"], "high", "wtd"),
    "Finarkein": ("Data & Analytics", ["account-aggregator", "open-finance", "financial-data-analytics"], "high", "wtd"),
    "Firsthive": ("Data & Analytics", ["customer-data-platform", "decisioning"], "high", "wtd"),
    "Posidex Technologies": ("Data & Analytics", ["customer-data-platform", "decisioning"], "high", "wtd"),
    "Kyvos": ("Data & Analytics", ["business-intelligence", "data-engineering"], "high", "wtd"),
    "Vunet Systems": ("Data & Analytics", ["observability", "business-intelligence"], "high", "wtd"),
    "Datagen Systems Private Limited (LAKE X AI)": ("Data & Analytics", ["data-governance", "enterprise-data"], "high", "wtd"),
    "Lexis Nexis Risk Solutions": ("Data & Analytics", ["risk-analytics", "alternative-data"], "high", "wtd"),
    "Dista Technology Pvt. Ltd.": ("Data & Analytics", ["location-intelligence"], "high", "wtd"),
    "Affluense.ai": ("Data & Analytics", ["wealth-intelligence", "sales-intelligence"], "high", "wtd"),
    "Quantum Data Engines": ("Data & Analytics", ["risk-analytics"], "low", "wtd"),
    "Ignosis": ("Data & Analytics", ["financial-intelligence"], "low", "tier"),

    # ---- enterprise software & IT services ----
    "Neo4j": ("Enterprise Software & IT Services", ["database", "data-infrastructure"], "high", "wtd"),
    "Cockroach labs": ("Enterprise Software & IT Services", ["database", "cloud-infrastructure"], "high", "wtd"),
    "Aerospike": ("Enterprise Software & IT Services", ["database", "data-infrastructure"], "high", "wtd"),
    "MongoDB": ("Enterprise Software & IT Services", ["database", "cloud-infrastructure"], "high", "wtd"),
    "GeekyAnts": ("Enterprise Software & IT Services", ["product-engineering", "it-consulting"], "high", "wtd"),
    "Cygnet.One": ("Enterprise Software & IT Services", ["it-services", "cloud-infrastructure", "product-engineering"], "high", "wtd"),
    "Int Global": ("Enterprise Software & IT Services", ["digital-transformation", "cloud-infrastructure"], "high", "wtd"),
    "NeoSoft Technology": ("Enterprise Software & IT Services", ["software-development", "it-services"], "high", "wtd"),
    "Nerve Solutions": ("Enterprise Software & IT Services", ["fintech-consulting", "software-development"], "high", "wtd"),
    "Unify Technologies": ("Enterprise Software & IT Services", ["digital-transformation", "software-development"], "high", "wtd"),
    "AVSS EFORRM INDIA PVT LTD": ("Enterprise Software & IT Services", ["software-development", "digital-marketing"], "high", "wtd"),
    "GEMCARDS": ("Enterprise Software & IT Services", ["it-services", "software-development"], "high", "wtd"),
    "Parasoft": ("Enterprise Software & IT Services", ["software-testing", "devtools"], "high", "wtd"),
    "Lemon Yellow": ("Enterprise Software & IT Services", ["design-agency"], "high", "wtd"),
    "Comviva": ("Enterprise Software & IT Services", ["fintech-software", "martech"], "medium", "wtd"),

    # ---- customer engagement / CRM / CPaaS ----
    "Sinch": ("Customer Engagement, CRM & CPaaS", ["cpaas", "transactional-messaging", "otp"], "high", "wtd"),
    "Route Mobile": ("Customer Engagement, CRM & CPaaS", ["cpaas", "transactional-messaging", "otp"], "high", "wtd"),
    "helo.ai": ("Customer Engagement, CRM & CPaaS", ["cpaas", "whatsapp-business", "chatbots"], "high", "wtd"),
    "Alohaa.ai": ("Customer Engagement, CRM & CPaaS", ["cpaas", "contact-center", "whatsapp-business"], "high", "wtd"),
    "DoubleTick": ("Customer Engagement, CRM & CPaaS", ["whatsapp-business", "messaging", "chatbots"], "high", "wtd"),
    "Fyno": ("Customer Engagement, CRM & CPaaS", ["communication-orchestration", "messaging"], "high", "wtd"),
    "CleverTap": ("Customer Engagement, CRM & CPaaS", ["customer-engagement", "marketing-automation"], "high", "wtd"),
    "Simple2Call": ("Customer Engagement, CRM & CPaaS", ["contact-center", "customer-experience"], "high", "wtd"),
    "Leadsquared": ("Customer Engagement, CRM & CPaaS", ["crm", "sales-automation", "marketing-automation"], "high", "wtd"),
    "Salesforce": ("Customer Engagement, CRM & CPaaS", ["crm", "ai-agents"], "high", "wtd"),
    "Karix": ("Customer Engagement, CRM & CPaaS", ["customer-engagement"], "medium", "wtd"),

    # ---- spend & business finance ----
    "Zaggle": ("Spend & Business Finance", ["expense-management", "corporate-spend"], "high", "wtd"),
    "Tripgain": ("Spend & Business Finance", ["travel-expense-management", "corporate-travel", "expense-management"], "high", "wtd"),

    # ---- loyalty & rewards ----
    "Vernost": ("Loyalty & Rewards", ["loyalty", "rewards", "marketplaces"], "high", "wtd"),
    "Novus Loyalty": ("Loyalty & Rewards", ["loyalty-software", "rewards"], "high", "wtd"),
    "Benepik": ("Loyalty & Rewards", ["employee-rewards", "corporate-gifting", "loyalty"], "high", "wtd"),
    "Paramotor": ("Loyalty & Rewards", ["digital-gifting", "rewards"], "medium", "tier"),

    # ---- hardware & devices ----
    "M-tech Innovations": ("Hardware & Devices", ["smart-cards", "rfid", "secure-id-hardware", "automotive-components"], "medium", "wtd"),

    # ---- regulator & public sector ----
    "Gift City": ("Regulator & Public Sector", ["international-financial-centre", "special-economic-zone"], "medium", "wtd"),

    # ---- ecosystem, investors & advisory ----
    "Indifly": ("Ecosystem, Investors & Advisory", ["venture-building", "investor"], "high", "wtd"),
    "Treelife": ("Ecosystem, Investors & Advisory", ["advisory", "legal", "tax", "virtual-cfo"], "high", "wtd"),
    "IDA Ireland": ("Ecosystem, Investors & Advisory", ["country-delegation", "investment-promotion"], "low", "tier"),
    # The "Ecosystem" partner tier is GFF's own grouping for associations, incubators,
    # accelerators and community bodies rather than a sponsorship perk label, so it is
    # treated as informative — but only at low confidence, and it yields no subSectors.
    "AFN": ("Ecosystem, Investors & Advisory", [], "low", "tier"),
    "CIBE": ("Ecosystem, Investors & Advisory", [], "low", "tier"),
    "FinStep Asia": ("Ecosystem, Investors & Advisory", [], "low", "tier"),
    "FinTech Armenia": ("Ecosystem, Investors & Advisory", [], "low", "tier"),
    "GLEIF": ("Ecosystem, Investors & Advisory", [], "low", "tier"),
    "IIIT Bangalore": ("Ecosystem, Investors & Advisory", [], "low", "tier"),
    "ITEL": ("Ecosystem, Investors & Advisory", [], "low", "tier"),
    "NSRCEL IIMB": ("Ecosystem, Investors & Advisory", [], "low", "tier"),
    "SINE IIT Bombay Business Incubator": ("Ecosystem, Investors & Advisory", [], "low", "tier"),
    "The Fintech Meetup": ("Ecosystem, Investors & Advisory", [], "low", "tier"),
    "Financial Technology Association": ("Ecosystem, Investors & Advisory", [], "low", "tier"),
    "Kathmandu Fintel": ("Ecosystem, Investors & Advisory", [], "low", "tier"),

    # ---- outside financial services ----
    "Squareyards": ("Other Non-Fintech", ["real-estate", "proptech"], "high", "wtd"),
    "Vodafone Idea Business": ("Other Non-Fintech", ["telecom"], "high", "wtd"),
    "Brandworks Technologies Pvt Ltd": ("Other Non-Fintech", ["hardware-manufacturing", "industrial"], "medium", "wtd"),
}

# Partners that carry a whatTheyDo string which nonetheless says nothing about what
# the company does (placeholder copy, boilerplate marketing, event blurbs). Recorded
# here so the report can distinguish "no text at all" from "text with no signal".
NO_SIGNAL = {
    "ShellKode": "generic engineering tagline, no business line stated",
    "BUSINESS NEXT": "generic 'digital transformation' tagline",
    "ITRS": "generic tagline, no business line stated",
    "Mantra Softech": "company name and country only",
    "Sarvdhan": "placeholder meta-description copy",
    "Smartping": "generic efficiency tagline",
    "Sutradhar": "generic 'technology solutions' tagline",
    "PehchanPe": "one-line product slogan, no business line stated",
    "Perto": "generic Portuguese marketing copy, no business line stated",
    "JCB International Co. Ltd.": "'This is the website for JCB, Japan' - states nothing about the business",
    "DBS Bank": "brand/awards copy only; does not state a business line",
    "Voice India": "regulator acronyms and a data-sovereignty slogan; no business line stated",
}


# =============================================================================
# Second pass. scratch-4's Apify enrichment added whatTheyDo text for ~120 more
# partners after the first pass. Everything below was read and classified from
# that newly-arrived text.
# =============================================================================

DECISIONS.update({
    # ---- payments ----
    "Cashfree Payments": ("Payments", ["payment-gateway", "merchant-acquiring", "cross-border-payments"], "high", "wtd"),
    "Concerto": ("Payments", ["payment-gateway", "merchant-acquiring"], "high", "wtd"),
    "Infibeam Avenues": ("Payments", ["payment-gateway", "merchant-acquiring", "fintech-software"], "high", "wtd"),
    "Juspay": ("Payments", ["payment-orchestration", "payments-infrastructure", "upi"], "high", "wtd"),
    "NPCI": ("Payments", ["payments-infrastructure", "upi", "card-networks", "public-infrastructure"], "high", "wtd"),
    "NTT Data (ADAPTIS)": ("Payments", ["merchant-acquiring", "payment-gateway", "pos-acceptance"], "high", "wtd"),
    "Oxymoney": ("Payments", ["upi", "prepaid", "bill-payments", "expense-management"], "high", "wtd"),
    "Pay10": ("Payments", ["payment-gateway", "cross-border-payments", "payment-processing"], "high", "wtd"),
    "Phi Commerce": ("Payments", ["payment-gateway", "omnichannel-payments"], "high", "wtd"),
    "Suvidhaa Pe": ("Payments", ["consumer-payments", "payment-processing"], "high", "wtd"),
    "Zrika": ("Payments", ["merchant-payments", "upi", "payments-infrastructure", "risk-management"], "high", "wtd"),

    # ---- cross-border & FX ----
    "PayGlocal": ("Cross-Border & FX", ["cross-border-payments", "payments-infrastructure"], "high", "wtd"),
    "Wise": ("Cross-Border & FX", ["remittances", "cross-border-payments"], "high", "wtd"),

    # ---- lending & credit ----
    "Fintree Finance Pvt. Ltd.": ("Lending & Credit", ["financial-inclusion"], "high", "wtd"),
    "Kissht": ("Lending & Credit", ["consumer-lending", "personal-loans"], "high", "wtd"),
    "True Balance": ("Lending & Credit", ["consumer-lending", "personal-loans"], "high", "wtd"),
    "My Mudra Fincorp": ("Lending & Credit", ["loan-marketplace", "personal-loans", "home-loans", "business-loans"], "high", "wtd"),
    "LenDenClub": ("Lending & Credit", ["p2p-lending", "nbfc"], "high", "wtd"),
    "Knight Fintech": ("Lending & Credit", ["lending-software", "embedded-finance", "treasury"], "high", "wtd"),
    "Yubi": ("Lending & Credit", ["lending-software", "credit-decisioning", "collections-recovery"], "high", "wtd"),
    "Rezolv AI Technology Solutions Pvt Ltd": ("Lending & Credit", ["collections-recovery"], "high", "wtd"),
    "Vayana Finserv": ("Lending & Credit", ["trade-finance", "supply-chain-finance"], "high", "wtd"),

    # ---- credit bureau ----
    "CRIF": ("Credit Bureau & Risk Scoring", ["credit-bureau", "credit-data", "credit-scoring"], "high", "wtd"),

    # ---- banks & FIs ----
    "DCB Bank": ("Banking & Financial Institutions", ["retail-banking", "digital-lending"], "high", "wtd"),
    "Indian Bank": ("Banking & Financial Institutions", ["retail-banking", "digital-lending"], "high", "wtd"),
    "Union Bank of India": ("Banking & Financial Institutions", ["retail-banking", "digital-lending", "insurance-distribution"], "high", "wtd"),
    "Airtel Payments Bank": ("Banking & Financial Institutions", ["retail-banking"], "medium", "wtd"),
    "J.P. Morgan": ("Banking & Financial Institutions", [], "low", "wtd"),

    # ---- banking infrastructure ----
    "Intellect Design Arena Ltd": ("Banking Infrastructure & Core Systems", ["core-banking", "banking-apis", "digital-banking-software"], "high", "wtd"),
    "Kiya.ai": ("Banking Infrastructure & Core Systems", ["core-banking", "compliance-automation"], "high", "wtd"),
    "Zeta": ("Banking Infrastructure & Core Systems", ["core-banking", "banking-apis", "banking-as-a-service"], "high", "wtd"),
    "TransBnk": ("Banking Infrastructure & Core Systems", ["transaction-banking", "banking-infrastructure", "treasury"], "high", "wtd"),
    "Paysprint": ("Banking Infrastructure & Core Systems", ["banking-apis", "embedded-finance", "kyc"], "high", "wtd"),
    "Vakrangee": ("Banking Infrastructure & Core Systems", ["agent-banking", "business-correspondent", "financial-inclusion"], "high", "wtd"),
    "Integra Micro": ("Banking Infrastructure & Core Systems", ["banking-infrastructure", "digital-identity", "financial-inclusion"], "medium", "wtd"),
    "NPST": ("Banking Infrastructure & Core Systems", ["digital-banking-software", "payments-infrastructure"], "medium", "wtd"),
    "Montran Corporation India": ("Banking Infrastructure & Core Systems", ["banking-infrastructure"], "medium", "wtd"),
    "PSB Alliance": ("Banking Infrastructure & Core Systems", ["banking-infrastructure"], "medium", "wtd"),
    "Finacus": ("Banking Infrastructure & Core Systems", [], "low", "wtd"),

    # ---- wealth & capital markets ----
    "5paisa Capital Limited": ("Wealth & Capital Markets", ["broking", "equity-trading", "derivatives", "retail-investing"], "high", "wtd"),
    "Metropolitan Stock Exchange": ("Wealth & Capital Markets", ["stock-exchange", "equity-trading", "derivatives"], "high", "wtd"),
    "Alt Drx": ("Wealth & Capital Markets", ["fractional-real-estate", "retail-investing"], "high", "wtd"),
    "Fintoo": ("Wealth & Capital Markets", ["financial-planning", "robo-advisory", "tax-advisory"], "high", "wtd"),
    "Bajaj Capital": ("Wealth & Capital Markets", ["wealth-management"], "low", "wtd"),

    # ---- diversified ----
    "Jio Financial Services Limited": ("Diversified Financial Services", ["diversified-financial-group", "financing", "investing", "credit-cards", "digital-gold"], "high", "wtd"),
    "Navi Technologies Limited": ("Diversified Financial Services", ["diversified-financial-group", "payments", "financing", "investing", "insurance-distribution"], "high", "wtd"),

    # ---- insurance ----
    "Heph": ("Insurance & Insurtech", ["insurance-infrastructure", "insurance-distribution"], "high", "wtd"),
    "Turtlefin": ("Insurance & Insurtech", ["insurance-distribution", "insurance-infrastructure"], "high", "wtd"),

    # ---- regtech & compliance ----
    "Finnulate": ("RegTech & Compliance", ["compliance-automation", "regulatory-reporting", "grc"], "high", "wtd"),
    "Zigram": ("RegTech & Compliance", ["aml-screening", "transaction-monitoring"], "high", "wtd"),

    # ---- fraud & risk ----
    "Bureau ID": ("Fraud Prevention & Risk", ["fraud-detection", "identity-verification"], "high", "wtd"),
    "Data Sutram": ("Fraud Prevention & Risk", ["fraud-detection", "risk-management", "collections-recovery"], "high", "wtd"),

    # ---- identity & KYC ----
    "HyperVerge": ("Identity & KYC", ["kyc", "identity-verification", "aml-screening", "fraud-detection"], "high", "wtd"),
    "Verismart": ("Identity & KYC", ["kyc", "identity-verification", "data-protection"], "high", "wtd"),

    # ---- cybersecurity ----
    "CryptoBind": ("Cybersecurity", ["hsm", "encryption", "data-protection"], "high", "wtd"),
    "CyberSRCC": ("Cybersecurity", ["security-compliance", "grc", "data-governance"], "high", "wtd"),

    # ---- AI & automation ----
    "Agentic Universe": ("AI & Automation", ["agentic-ai", "voice-ai", "conversational-ai"], "high", "wtd"),
    "Bolna": ("AI & Automation", ["voice-ai", "ai-agents"], "high", "wtd"),
    "Devrev": ("AI & Automation", ["ai-platform"], "high", "wtd"),
    "Fundamento": ("AI & Automation", ["ai-agents"], "high", "wtd"),
    "Karta AI": ("AI & Automation", ["customer-support-ai", "ai-agents", "voice-ai"], "high", "wtd"),
    "Oli AI": ("AI & Automation", ["voice-ai", "ai-agents", "collections-recovery"], "high", "wtd"),
    "RevRag.AI": ("AI & Automation", ["ai-agents", "conversational-ai"], "high", "wtd"),
    "Ringg.ai": ("AI & Automation", ["voice-ai", "ai-agents", "conversational-ai"], "high", "wtd"),
    "Sarvam.ai": ("AI & Automation", ["ai-platform", "speech-recognition", "speech-synthesis", "conversational-ai"], "high", "wtd"),
    "WhyMinds Global": ("AI & Automation", ["agentic-ai", "ai-platform", "venture-building"], "medium", "wtd"),

    # ---- data & analytics ----
    "FinEye": ("Data & Analytics", ["financial-data-analytics", "credit-underwriting", "fraud-detection"], "high", "wtd"),
    "MapmyIndia": ("Data & Analytics", ["location-intelligence"], "high", "wtd"),
    "Nexensus": ("Data & Analytics", ["alternative-data", "risk-analytics"], "high", "wtd"),

    # ---- enterprise software & IT services ----
    "Redhat": ("Enterprise Software & IT Services", ["cloud-infrastructure", "devtools"], "high", "wtd"),
    "YugabyteDB Inc.": ("Enterprise Software & IT Services", ["database", "cloud-infrastructure"], "high", "wtd"),
    "Zoho": ("Enterprise Software & IT Services", ["business-software", "crm"], "high", "wtd"),
    "Winjit Technologies": ("Enterprise Software & IT Services", ["software-development", "it-services"], "high", "wtd"),
    "Tech Rajendra": ("Enterprise Software & IT Services", ["it-services"], "high", "wtd"),
    "Qualitrix": ("Enterprise Software & IT Services", ["software-testing", "it-services"], "high", "wtd"),
    "Protean eGov Technologies Limited": ("Enterprise Software & IT Services", ["e-governance", "digital-transformation"], "high", "wtd"),
    "QistonPe": ("Enterprise Software & IT Services", ["govtech", "workflow-automation"], "high", "wtd"),
    "Credentek": ("Enterprise Software & IT Services", ["secure-file-transfer"], "medium", "wtd"),
    "Kuster Engineering": ("Enterprise Software & IT Services", ["bpo"], "low", "wtd"),
    "Cisco": ("Enterprise Software & IT Services", [], "low", "wtd"),

    # ---- customer engagement / CRM / CPaaS ----
    "Chat360": ("Customer Engagement, CRM & CPaaS", ["chatbots", "whatsapp-business", "customer-engagement"], "high", "wtd"),
    "Domywork": ("Customer Engagement, CRM & CPaaS", ["crm", "sales-automation"], "high", "wtd"),
    "Equence Technologies": ("Customer Engagement, CRM & CPaaS", ["cpaas", "messaging", "otp", "whatsapp-business"], "high", "wtd"),
    "Pinnacle Services": ("Customer Engagement, CRM & CPaaS", ["chatbots", "customer-engagement", "marketing-automation"], "high", "wtd"),
    "WhatsApp": ("Customer Engagement, CRM & CPaaS", ["messaging", "whatsapp-business"], "high", "wtd"),
    "Zykrr": ("Customer Engagement, CRM & CPaaS", ["customer-experience"], "high", "wtd"),
    "iDreamBiz": ("Customer Engagement, CRM & CPaaS", ["messaging"], "medium", "wtd"),

    # ---- regulator & public sector ----
    "IFSCA": ("Regulator & Public Sector", ["financial-regulator", "international-financial-centre"], "high", "wtd"),
    "UIDAI": ("Regulator & Public Sector", ["statutory-authority", "government-body", "digital-identity"], "high", "wtd"),
    "RBIH": ("Regulator & Public Sector", ["government-body"], "high", "wtd"),
    "ONDC": ("Regulator & Public Sector", ["public-infrastructure", "government-body"], "medium", "wtd"),

    # ---- ecosystem, investors & advisory ----
    "BCG": ("Ecosystem, Investors & Advisory", ["consulting", "advisory"], "high", "wtd"),
    "EY": ("Ecosystem, Investors & Advisory", ["consulting", "advisory", "tax"], "high", "wtd"),
    "KPMG": ("Ecosystem, Investors & Advisory", ["consulting", "advisory", "tax"], "high", "wtd"),
    "PWC": ("Ecosystem, Investors & Advisory", ["consulting", "advisory", "tax"], "high", "wtd"),
    "IIMA Ventures": ("Ecosystem, Investors & Advisory", ["incubator", "venture-capital", "investor"], "high", "wtd"),
    "Luxembourg House of Financial Technology": ("Ecosystem, Investors & Advisory", ["investment-promotion", "country-delegation"], "high", "wtd"),
    "UK FCDO": ("Ecosystem, Investors & Advisory", ["country-delegation", "government-body"], "high", "wtd"),

    # ---- outside financial services ----
    "DreamFolks": ("Other Non-Fintech", ["travel"], "high", "wtd"),
    "Times Internet": ("Other Non-Fintech", ["advertising", "media"], "high", "wtd"),

    # ---- tier-only calls from pass 1, now superseded by the company's own text ----
    "86400": ("Payments", ["payments-infrastructure", "banking-apis", "upi"], "high", "wtd"),
    "ScoreMe": ("Data & Analytics", ["financial-data-analytics", "credit-underwriting"], "high", "wtd"),
    "Transunion CIBIL": ("Credit Bureau & Risk Scoring", ["credit-scoring"], "medium", "wtd"),
    "Mitigata": ("Cybersecurity", ["security-compliance", "cyber-insurance"], "high", "wtd"),
    "Digio": ("Identity & KYC", ["kyc", "esign", "onboarding", "aml-screening"], "high", "wtd"),
    "Protectt.ai Labs": ("Cybersecurity", ["mobile-app-security", "application-security", "ai-security", "red-teaming"], "high", "wtd"),
    "Ignosis": ("Data & Analytics", ["account-aggregator", "open-finance", "risk-analytics"], "high", "wtd"),
    "Paramotor": ("Payments", ["prepaid", "bill-payments", "digital-gifting"], "high", "wtd"),
    "IDA Ireland": ("Ecosystem, Investors & Advisory", ["investment-promotion", "country-delegation"], "high", "wtd"),
    "GLEIF": ("Identity & KYC", ["legal-entity-identifier", "kyb"], "high", "wtd"),
})

# Second-pass additions to the "has text, text says nothing" list.
NO_SIGNAL.update({
    "CCIL": "site title / legal name only, no description",
    "CRED": "brand copy ('financial & lifestyle experiences'); no business line stated",
    "Equifax": "brand purpose statement; no business line stated",
    "FIS": "brand copy; says 'fintech' but names no business line",
    "Qualtech Edge": "product feature blurb; business line not identifiable",
    "SEBI": "scraped fragment of a cybersecurity FAQ page; says nothing about the organisation",
    "Utimaco": "tagline only, no business line stated",
    "Watchdata": "tagline only, no business line stated",
})
