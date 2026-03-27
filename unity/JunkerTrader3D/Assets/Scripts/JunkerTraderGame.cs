using System;
using System.Collections.Generic;
using UnityEngine;

public partial class JunkerTraderGame : MonoBehaviour
{
    private class CarVisualTag : MonoBehaviour
    {
        public int CarId;
    }

    private enum View
    {
        Market,
        Negotiation,
        Garage,
        SaleResult
    }

    private enum FaultId
    {
        Engine,
        Transmission,
        Rust,
        Electrical,
        Interior,
        Tires
    }

    [Serializable]
    private class FaultDef
    {
        public string Label;
        public int RepairCost;
        public int ValueHit;
        public float SalePenalty;

        public FaultDef(string label, int repairCost, int valueHit, float salePenalty)
        {
            Label = label;
            RepairCost = repairCost;
            ValueHit = valueHit;
            SalePenalty = salePenalty;
        }
    }

    private class SellerPersonality
    {
        public string Name;
        public float Patience;

        public SellerPersonality(string name, float patience)
        {
            Name = name;
            Patience = patience;
        }
    }

    private class BuyerType
    {
        public string Name;
        public float Tolerance;
        public float FlawSensitivity;
        public float CosmeticNeed;
        public float HaggleChance;
        public string Profile;

        public BuyerType(string name, float tolerance, float flawSensitivity, float cosmeticNeed, float haggleChance, string profile)
        {
            Name = name;
            Tolerance = tolerance;
            FlawSensitivity = flawSensitivity;
            CosmeticNeed = cosmeticNeed;
            HaggleChance = haggleChance;
            Profile = profile;
        }
    }

    private class Car
    {
        public int Id;
        public string Name;
        public int Age;
        public int Mileage;
        public int BaseMarketValue;
        public int AskingPrice;
        public int CosmeticCondition;
        public float RiskScoreModifier;
        public SellerPersonality Seller;
        public int LastRejectedOffer;
        public int ReservePrice;
        public int OffendedCount;

        public List<FaultId> VisibleFaults = new List<FaultId>();
        public List<FaultId> HiddenFaults = new List<FaultId>();

        public bool Inspected;
        public HashSet<FaultId> RepairedFaults = new HashSet<FaultId>();

        public int BoughtFor;
        public int TotalInvested;
        public int PurchaseDay;
        public bool CleanedOnce;

        public List<string> WorkLog = new List<string>();
    }

    private class DailyEvent
    {
        public string Name;
        public string Desc;
        public float AskModifier;
        public float SaleModifier;
        public float InspectModifier;

        public DailyEvent(string name, string desc, float askModifier, float saleModifier, float inspectModifier)
        {
            Name = name;
            Desc = desc;
            AskModifier = askModifier;
            SaleModifier = saleModifier;
            InspectModifier = inspectModifier;
        }
    }

    private class PendingSale
    {
        public int CarId;
        public BuyerType Buyer;
        public string Mode;
        public int ListPrice;
        public int OfferedPrice;
        public float TrueValue;
        public string Outcome;
        public List<FaultId> Unresolved = new List<FaultId>();
    }

    private struct DealRecord
    {
        public string Name;
        public int BoughtFor;
        public int Invested;
        public int SoldFor;
        public int Profit;
        public string Buyer;
        public int BuyDay;
        public int SellDay;
    }

    // Balancing constants
    private const int StartMoney = 14000;
    private const int MaxDays = 10;
    private const int CarsPerDayMin = 3;
    private const int CarsPerDayMax = 5;
    private const int InspectCost = 220;
    private const int CosmeticCleanCost = 180;
    private const int SellAttemptFee = 120;
    private const float LowballRatio = 0.72f;
    private const float FairRatio = 0.90f;
    private const float AskRatio = 1.00f;
    private const float QuickSellMult = 0.92f;
    private const float FairSellMult = 1.00f;
    private const float PremiumSellMult = 1.10f;

    private static readonly Dictionary<FaultId, FaultDef> Faults = new Dictionary<FaultId, FaultDef>
    {
        { FaultId.Engine, new FaultDef("Engine Problem", 1200, 1800, 0.18f) },
        { FaultId.Transmission, new FaultDef("Transmission Problem", 1500, 2200, 0.20f) },
        { FaultId.Rust, new FaultDef("Rust", 500, 900, 0.08f) },
        { FaultId.Electrical, new FaultDef("Electrical Issue", 700, 1100, 0.10f) },
        { FaultId.Interior, new FaultDef("Interior Damage", 350, 700, 0.05f) },
        { FaultId.Tires, new FaultDef("Tire Wear", 300, 550, 0.04f) }
    };

    private static readonly FaultId[] MechanicalFaults =
    {
        FaultId.Engine,
        FaultId.Transmission,
        FaultId.Tires
    };

    private static readonly string[] CarNames =
    {
        "RustRocket", "Civic-ish", "Turbo Brick", "Grandpa Cruiser", "Mystery Wagon", "Sad Coupe",
        "Budget Beast", "Parking Lot Legend", "Oil Leaker GT", "Noisy Hatch", "Moonlight Sedan"
    };

    private readonly List<SellerPersonality> _sellerProfiles = new List<SellerPersonality>
    {
        new SellerPersonality("Desperate", 0.70f),
        new SellerPersonality("Normal", 1.00f),
        new SellerPersonality("Stubborn", 1.25f)
    };

    private readonly List<BuyerType> _buyers = new List<BuyerType>
    {
        new BuyerType("Bargain Hunter", 0.92f, 0.85f, 0.4f, 0.75f, "Wants cheap deals, tolerates rough condition"),
        new BuyerType("Picky Buyer", 0.98f, 1.6f, 1.2f, 0.45f, "Pays okay only for clean cars with few faults"),
        new BuyerType("Enthusiast", 1.06f, 0.9f, 0.7f, 0.25f, "Accepts premium if key mechanical parts are sorted"),
        new BuyerType("Impulse Buyer", 1.12f, 0.65f, 1.0f, 0.2f, "Buys quickly if car looks appealing")
    };

    private int _day = 1;
    private int _money = StartMoney;
    private int _totalRevenue;
    private int _totalSpent;
    private int _buyersRemainingToday = 1;
    private int _buyerDemand = 1;
    private int _idCounter = 1;

    private View _view = View.Market;
    private DailyEvent _eventToday;
    private PendingSale _pendingSale;
    private Car _selectedMarketCar;
    private Car _selectedGarageCar;

    private readonly List<Car> _marketCars = new List<Car>();
    private readonly List<Car> _inventory = new List<Car>();
    private readonly List<BuyerType> _buyerQueue = new List<BuyerType>();
    private readonly List<string> _eventLog = new List<string>();
    private readonly List<DealRecord> _completedDeals = new List<DealRecord>();

    private readonly Dictionary<int, GameObject> _carVisuals = new Dictionary<int, GameObject>();
    private Transform _showroomRoot;
    private Transform _garageAnchor;
    private Transform _saleAnchor;
    private GameObject _garagePreview;

    private float _offerSliderPct = 90f;
    private float _sellSliderPct = 100f;
    private float _counterSliderPct = 105f;
    private Vector2 _cameraOrbit = new Vector2(28f, 0f);
    private float _cameraDistance = 18f;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Bootstrap()
    {
        var existing = FindFirstObjectByType<JunkerTraderGame>();
        if (existing != null)
        {
            return;
        }

        var go = new GameObject("JunkerTraderGame");
        go.AddComponent<JunkerTraderGame>();
        DontDestroyOnLoad(go);
    }

    private void Start()
    {
        Setup3DScene();
        EnsureBuyerQueue();
        GenerateDay();
        FocusView();
        Log("Run started.");
    }

    private void AttemptOffer(Car car, int offer, string mode)
    {
        if (offer > _money)
        {
            Log($"Offer failed: not enough money for ${offer:N0}.");
            return;
        }

        if (offer <= Mathf.RoundToInt(car.LastRejectedOffer * 0.88f))
        {
            Log($"Seller rejects ${offer:N0} immediately after higher earlier offer.");
            _view = View.Market;
            return;
        }

        float baseChance = mode == "lowball" ? 0.28f : mode == "asking" ? 0.92f : 0.62f;
        float trueValue = CalcTrueValueForPurchase(car);
        float qualityBonus = Mathf.Clamp((trueValue / Mathf.Max(1f, car.AskingPrice) - 1f) * 0.25f, -0.12f, 0.12f);
        float patienceBonus = (1f - car.Seller.Patience) * 0.2f;
        float acceptChance = Mathf.Clamp(baseChance + qualityBonus + patienceBonus, 0.05f, 0.98f);

        if (offer >= car.AskingPrice || offer >= car.ReservePrice)
        {
            BuyCar(car, offer);
            Log("Seller accepted immediately because offer met seller expectation.");
            return;
        }

        if (UnityEngine.Random.value < acceptChance)
        {
            BuyCar(car, offer);
            return;
        }

        car.LastRejectedOffer = offer;
        car.OffendedCount += 1;
        float ratio = offer / Mathf.Max(1f, car.AskingPrice);
        float leaveChance = Mathf.Clamp(0.20f + (car.Seller.Patience - 1f) * 0.28f + Mathf.Max(0f, 0.84f - ratio) * 0.75f + car.OffendedCount * 0.08f, 0.04f, 0.92f);

        if (ratio <= 0.84f && UnityEngine.Random.value < leaveChance)
        {
            _marketCars.Remove(car);
            RemoveVisual(car.Id);
            Log($"Seller got offended by ${offer:N0} and left with {car.Name}.");
            _view = View.Market;
            return;
        }

        Log($"Seller rejected ${offer:N0} for {car.Name}.");
        _view = View.Market;
    }

    private void BuyCar(Car marketCar, int price)
    {
        var owned = CloneForInventory(marketCar, price);
        _money -= price;
        _totalSpent += price;
        _inventory.Add(owned);

        _marketCars.Remove(marketCar);
        RemoveVisual(marketCar.Id);
        _selectedGarageCar = owned;
        Log($"Bought {owned.Name} for ${price:N0}. Inventory now {_inventory.Count}.");
        _view = View.Market;
    }

    private void InspectCar(Car car)
    {
        if (car.Inspected)
        {
            return;
        }

        int cost = Mathf.RoundToInt(InspectCost * _eventToday.InspectModifier);
        if (_money < cost)
        {
            Log($"Cannot inspect: need ${cost:N0}.");
            return;
        }

        _money -= cost;
        _totalSpent += cost;
        car.TotalInvested += cost;
        car.Inspected = true;
        car.WorkLog.Add($"d{_day}:inspect:-${cost:N0}");
        Log($"Inspection complete on {car.Name}. Hidden faults revealed.");
    }

    private void RepairFault(Car car, FaultId fault)
    {
        if (car.RepairedFaults.Contains(fault))
        {
            return;
        }

        if (_eventToday.Name == "Mechanic Strike" && IsMechanical(fault))
        {
            Log($"Mechanic Strike blocks repair on {Faults[fault].Label} today.");
            return;
        }

        int cost = Mathf.RoundToInt(Faults[fault].RepairCost * _eventToday.InspectModifier);
        if (_money < cost)
        {
            Log($"Cannot repair {Faults[fault].Label}: need ${cost:N0}.");
            return;
        }

        _money -= cost;
        _totalSpent += cost;
        car.TotalInvested += cost;
        car.RepairedFaults.Add(fault);
        car.WorkLog.Add($"d{_day}:repair:{fault}:-${cost:N0}");
        Log($"Repaired {Faults[fault].Label} on {car.Name} for ${cost:N0}.");
    }

    private void CleanCar(Car car)
    {
        if (car.CleanedOnce)
        {
            Log($"Cleaning already used on {car.Name}.");
            return;
        }

        if (_money < CosmeticCleanCost)
        {
            Log($"Cannot clean: need ${CosmeticCleanCost:N0}.");
            return;
        }

        _money -= CosmeticCleanCost;
        _totalSpent += CosmeticCleanCost;
        car.TotalInvested += CosmeticCleanCost;
        car.CosmeticCondition = Mathf.Clamp(car.CosmeticCondition + 10, 0, 100);
        car.CleanedOnce = true;
        car.WorkLog.Add($"d{_day}:clean:-${CosmeticCleanCost:N0}");
        Log($"Quick cleaning done on {car.Name} for ${CosmeticCleanCost:N0}.");
    }

    private void AttemptSale(Car car, string mode, float multiplier)
    {
        if (_buyersRemainingToday <= 0)
        {
            Log("No buyers left today. End day for more buyers.");
            return;
        }

        var buyer = CurrentBuyer();
        if (buyer == null)
        {
            Log("No buyer available.");
            return;
        }

        if (_money < SellAttemptFee)
        {
            Log($"Cannot list: need ${SellAttemptFee:N0} fee.");
            return;
        }

        _money -= SellAttemptFee;
        _totalSpent += SellAttemptFee;
        car.TotalInvested += SellAttemptFee;
        car.WorkLog.Add($"d{_day}:sellAttempt:{mode}:-${SellAttemptFee:N0}");

        float trueValue = CalcTrueValue(car) * _eventToday.SaleModifier;
        int listPrice = Mathf.RoundToInt(trueValue * multiplier);
        var unresolved = UnresolvedFaults(car);

        float unresolvedPenalty = 0f;
        foreach (var f in unresolved)
        {
            unresolvedPenalty += Faults[f].SalePenalty;
        }
        unresolvedPenalty *= buyer.FlawSensitivity;

        float cosmeticPenalty = ((100f - car.CosmeticCondition) / 100f) * buyer.CosmeticNeed;
        float pricePressure = listPrice / Mathf.Max(1f, trueValue);

        float sellChance = 0.72f;
        sellChance -= unresolvedPenalty * 0.8f;
        sellChance -= cosmeticPenalty * 0.25f;
        sellChance -= (pricePressure - buyer.Tolerance) * 0.85f;
        sellChance += BuyerFitBonus(buyer, car, unresolved);
        sellChance = Mathf.Clamp(sellChance, 0.03f, 0.97f);

        string outcome = "failed sale";
        int finalPrice = 0;

        if (UnityEngine.Random.value < sellChance)
        {
            outcome = "sold instantly";
            finalPrice = listPrice;
        }
        else if (UnityEngine.Random.value < buyer.HaggleChance)
        {
            outcome = "buyer forced lower final price";
            float haggle = UnityEngine.Random.Range(0.86f, 0.95f);
            finalPrice = Mathf.RoundToInt(listPrice * haggle);
        }
        else if (mode != "quick" && UnityEngine.Random.value < Mathf.Clamp(sellChance + 0.2f, 0.08f, 0.95f))
        {
            outcome = "sold after price drop";
            finalPrice = Mathf.RoundToInt(listPrice * 0.92f);
        }

        _buyersRemainingToday = Mathf.Max(0, _buyersRemainingToday - 1);
        AdvanceBuyerQueue();

        if (finalPrice <= 0)
        {
            car.WorkLog.Add($"d{_day}:sell:failed");
            Log($"{buyer.Name} failed sale: {car.Name} not sold.");
            Log($"{_buyersRemainingToday} buyer(s) left today.");
            _view = View.Garage;
            return;
        }

        _pendingSale = new PendingSale
        {
            CarId = car.Id,
            Buyer = buyer,
            Mode = mode,
            ListPrice = listPrice,
            OfferedPrice = finalPrice,
            TrueValue = trueValue,
            Outcome = outcome,
            Unresolved = unresolved
        };

        _counterSliderPct = 105f;
        Log($"{buyer.Name} offered ${finalPrice:N0} for {car.Name}. Accept/reject/counter.");
        Log($"{_buyersRemainingToday} buyer(s) left today.");
        _view = View.SaleResult;
    }

    private void AttemptCounteroffer(int counter)
    {
        if (_pendingSale == null)
        {
            return;
        }

        if (counter <= _pendingSale.OfferedPrice)
        {
            _pendingSale.OfferedPrice = counter;
            Log($"Counter lowered to ${counter:N0}.");
            return;
        }

        float increaseRatio = (counter - _pendingSale.OfferedPrice) / Mathf.Max(1f, _pendingSale.OfferedPrice);
        float acceptChance = Mathf.Clamp(0.62f + (_pendingSale.Buyer.Tolerance - 1f) * 0.55f + _pendingSale.Buyer.HaggleChance * 0.16f - increaseRatio * 1.55f, 0.03f, 0.95f);

        if (UnityEngine.Random.value < acceptChance)
        {
            _pendingSale.OfferedPrice = counter;
            Log($"{_pendingSale.Buyer.Name} accepted counteroffer ${counter:N0}.");
            return;
        }

        float walkChance = Mathf.Clamp(0.12f + increaseRatio * 1.2f - _pendingSale.Buyer.HaggleChance * 0.22f, 0.04f, 0.9f);
        if (UnityEngine.Random.value < walkChance)
        {
            Log($"{_pendingSale.Buyer.Name} walked away after counteroffer.");
            _pendingSale = null;
            _view = View.Garage;
            return;
        }

        Log($"{_pendingSale.Buyer.Name} rejected counteroffer. Original offer stands.");
    }

    private void AcceptPendingSale()
    {
        if (_pendingSale == null)
        {
            return;
        }

        var car = _inventory.Find(c => c.Id == _pendingSale.CarId);
        if (car == null)
        {
            _pendingSale = null;
            _view = View.Garage;
            return;
        }

        int price = _pendingSale.OfferedPrice;
        _money += price;
        _totalRevenue += price;
        car.WorkLog.Add($"d{_day}:sell:+${price:N0}");

        int profit = price - car.TotalInvested;
        _completedDeals.Insert(0, new DealRecord
        {
            Name = car.Name,
            BoughtFor = car.BoughtFor,
            Invested = car.TotalInvested,
            SoldFor = price,
            Profit = profit,
            Buyer = _pendingSale.Buyer.Name,
            BuyDay = car.PurchaseDay,
            SellDay = _day
        });

        _inventory.Remove(car);
        if (_selectedGarageCar == car)
        {
            _selectedGarageCar = _inventory.Count > 0 ? _inventory[0] : null;
        }

        Log($"Deal accepted: {car.Name} sold for ${price:N0}. Deal P/L ${profit:N0}.");
        _pendingSale = null;
        _view = View.Garage;
    }

    private void RejectPendingSale()
    {
        if (_pendingSale == null)
        {
            return;
        }

        var car = _inventory.Find(c => c.Id == _pendingSale.CarId);
        if (car != null)
        {
            Log($"Rejected {_pendingSale.Buyer.Name} offer ${_pendingSale.OfferedPrice:N0} for {car.Name}.");
        }
        _pendingSale = null;
        _view = View.Garage;
    }

    private void SellToJunkyard(Car car)
    {
        int payout = CalcJunkyardPrice(car);
        _money += payout;
        _totalRevenue += payout;

        int profit = payout - car.TotalInvested;
        _completedDeals.Insert(0, new DealRecord
        {
            Name = car.Name,
            BoughtFor = car.BoughtFor,
            Invested = car.TotalInvested,
            SoldFor = payout,
            Profit = profit,
            Buyer = "Junkyard",
            BuyDay = car.PurchaseDay,
            SellDay = _day
        });

        Log($"Sold {car.Name} to junkyard for ${payout:N0}. Deal P/L ${profit:N0}.");
        _inventory.Remove(car);
        if (_selectedGarageCar == car)
        {
            _selectedGarageCar = _inventory.Count > 0 ? _inventory[0] : null;
        }
    }

    private void EndDay()
    {
        if (_day >= MaxDays)
        {
            Log($"Run over. Final money ${_money:N0}, revenue ${_totalRevenue:N0}, balance delta ${(_money - StartMoney):N0}.");
            return;
        }

        _day += 1;
        for (int i = 0; i < _buyersRemainingToday; i++)
        {
            AdvanceBuyerQueue();
        }

        GenerateDay();
        _view = View.Market;
        Log($"New day. {_marketCars.Count} listings generated.");
    }

    private void GenerateDay()
    {
        _pendingSale = null;
        RollDailyEvent();
        RollBuyerDemand();

        _marketCars.Clear();
        ClearMarketVisuals();

        int count = UnityEngine.Random.Range(CarsPerDayMin, CarsPerDayMax + 1);
        for (int i = 0; i < count; i++)
        {
            var car = GenerateCar();
            if (_eventToday.Name == "Rainy Market" && UnityEngine.Random.value < 0.45f && !car.VisibleFaults.Contains(FaultId.Rust) && !car.HiddenFaults.Contains(FaultId.Rust))
            {
                car.VisibleFaults.Add(FaultId.Rust);
                car.AskingPrice = Mathf.Max(450, car.AskingPrice - 300);
            }

            car.AskingPrice = Mathf.RoundToInt(car.AskingPrice * _eventToday.AskModifier);
            _marketCars.Add(car);
            SpawnCarVisual(car, _marketCars.Count - 1);
        }
    }

    private Car GenerateCar()
    {
        int age = UnityEngine.Random.Range(6, 24);
        int mileage = UnityEngine.Random.Range(70000, 280001);
        int cosmetic = UnityEngine.Random.Range(20, 96);
        float risk = UnityEngine.Random.value;

        int baseValue = Mathf.RoundToInt(14500 - age * 265 - mileage * 0.025f + UnityEngine.Random.Range(-1200, 1201));
        baseValue = Mathf.Clamp(baseValue, 1300, 12000);

        var visible = new List<FaultId>();
        var hidden = new List<FaultId>();
        var allFaults = (FaultId[])Enum.GetValues(typeof(FaultId));

        int faultCount = UnityEngine.Random.Range(1, 5);
        for (int i = 0; i < faultCount; i++)
        {
            var f = allFaults[UnityEngine.Random.Range(0, allFaults.Length)];
            if (visible.Contains(f) || hidden.Contains(f))
            {
                continue;
            }

            if (UnityEngine.Random.value < 0.55f)
            {
                visible.Add(f);
            }
            else
            {
                hidden.Add(f);
            }
        }

        if (visible.Count == 0 && hidden.Count == 0)
        {
            visible.Add(allFaults[UnityEngine.Random.Range(0, allFaults.Length)]);
        }

        int visiblePenalty = 0;
        foreach (var f in visible)
        {
            visiblePenalty += Mathf.RoundToInt(Faults[f].ValueHit * 0.7f);
        }

        int hiddenPenalty = 0;
        foreach (var f in hidden)
        {
            hiddenPenalty += Mathf.RoundToInt(Faults[f].ValueHit * 0.3f);
        }

        var seller = _sellerProfiles[UnityEngine.Random.Range(0, _sellerProfiles.Count)];
        int asking = baseValue - visiblePenalty - hiddenPenalty + UnityEngine.Random.Range(-400, 901);
        asking = Mathf.Clamp(asking, 550, Mathf.RoundToInt(baseValue * 1.08f));

        float reserveRatio = Mathf.Clamp(0.68f + seller.Patience * 0.16f + UnityEngine.Random.Range(-0.05f, 0.05f), 0.66f, 1.04f);
        int reserve = Mathf.RoundToInt(asking * reserveRatio);

        return new Car
        {
            Id = _idCounter++,
            Name = CarNames[UnityEngine.Random.Range(0, CarNames.Length)],
            Age = age,
            Mileage = mileage,
            BaseMarketValue = baseValue,
            AskingPrice = asking,
            CosmeticCondition = cosmetic,
            RiskScoreModifier = risk,
            Seller = seller,
            VisibleFaults = visible,
            HiddenFaults = hidden,
            ReservePrice = reserve,
            LastRejectedOffer = 0,
            OffendedCount = 0
        };
    }

    private Car CloneForInventory(Car source, int boughtFor)
    {
        return new Car
        {
            Id = source.Id,
            Name = source.Name,
            Age = source.Age,
            Mileage = source.Mileage,
            BaseMarketValue = source.BaseMarketValue,
            AskingPrice = source.AskingPrice,
            CosmeticCondition = source.CosmeticCondition,
            RiskScoreModifier = source.RiskScoreModifier,
            Seller = source.Seller,
            VisibleFaults = new List<FaultId>(source.VisibleFaults),
            HiddenFaults = new List<FaultId>(source.HiddenFaults),
            ReservePrice = source.ReservePrice,
            LastRejectedOffer = source.LastRejectedOffer,
            OffendedCount = source.OffendedCount,
            BoughtFor = boughtFor,
            TotalInvested = boughtFor,
            PurchaseDay = _day,
            Inspected = false,
            CleanedOnce = false,
            RepairedFaults = new HashSet<FaultId>(),
            WorkLog = new List<string> { $"d{_day}:buy:-${boughtFor:N0}" }
        };
    }

    private float CalcTrueValueForPurchase(Car car)
    {
        int value = car.BaseMarketValue;
        foreach (var f in MergeFaults(car.VisibleFaults, car.HiddenFaults))
        {
            value -= Faults[f].ValueHit;
        }
        value += Mathf.RoundToInt((car.CosmeticCondition - 50) * 35);
        return Mathf.Max(650, value);
    }

    private int CalcTrueValue(Car car)
    {
        int value = car.BaseMarketValue;
        foreach (var f in MergeFaults(car.VisibleFaults, car.HiddenFaults))
        {
            if (!car.RepairedFaults.Contains(f))
            {
                value -= Faults[f].ValueHit;
            }
        }

        value += Mathf.RoundToInt((car.CosmeticCondition - 50) * 35);
        return Mathf.Max(650, value);
    }

    private List<FaultId> UnresolvedFaults(Car car)
    {
        var all = MergeFaults(car.VisibleFaults, car.HiddenFaults);
        var unresolved = new List<FaultId>();
        foreach (var f in all)
        {
            if (!car.RepairedFaults.Contains(f))
            {
                unresolved.Add(f);
            }
        }
        return unresolved;
    }

    private float BuyerFitBonus(BuyerType buyer, Car car, List<FaultId> unresolved)
    {
        float bonus = 0f;
        int unresolvedCount = unresolved.Count;

        if (buyer.Name == "Bargain Hunter")
        {
            if (car.BoughtFor < 4000) bonus += 0.10f;
            if (car.CosmeticCondition < 45) bonus -= 0.03f;
        }

        if (buyer.Name == "Picky Buyer")
        {
            if (unresolvedCount == 0 && car.CosmeticCondition >= 70) bonus += 0.22f;
            if (unresolvedCount >= 2) bonus -= 0.25f;
        }

        if (buyer.Name == "Enthusiast")
        {
            bool major = unresolved.Contains(FaultId.Engine) || unresolved.Contains(FaultId.Transmission);
            bonus += major ? -0.16f : 0.16f;
        }

        if (buyer.Name == "Impulse Buyer")
        {
            if (car.CosmeticCondition >= 78) bonus += 0.18f;
            if (car.CosmeticCondition <= 35) bonus -= 0.12f;
        }

        return bonus;
    }

    private int CalcJunkyardPrice(Car car)
    {
        var unresolved = UnresolvedFaults(car);
        float salvageBase = car.BaseMarketValue * 0.22f;
        float repairedBonus = car.RepairedFaults.Count * 110f;
        float unresolvedPenalty = 0f;
        foreach (var f in unresolved)
        {
            unresolvedPenalty += Faults[f].ValueHit * 0.1f;
        }

        float cosmeticBonus = (car.CosmeticCondition - 50) * 8f;
        float inspectedBonus = car.Inspected ? 120f : 0f;

        float raw = salvageBase + repairedBonus + cosmeticBonus + inspectedBonus - unresolvedPenalty;
        return Mathf.RoundToInt(Mathf.Clamp(raw, 250f, 4200f));
    }

    private void RollDailyEvent()
    {
        float roll = UnityEngine.Random.value;
        _eventToday = new DailyEvent("None", "No major market shift.", 1f, 1f, 1f);

        if (roll < 0.20f)
        {
            _eventToday = new DailyEvent("Rainy Market", "Rusty heaps flood listings.", 0.97f, 1f, 1f);
        }
        else if (roll < 0.38f)
        {
            _eventToday = new DailyEvent("Tax Panic", "Sellers drop prices to unload quickly.", 0.90f, 1f, 1f);
        }
        else if (roll < 0.56f)
        {
            _eventToday = new DailyEvent("Weekend Hype", "Buyers pay a bit more today.", 1f, 1.06f, 1f);
        }
        else if (roll < 0.72f)
        {
            _eventToday = new DailyEvent("Mechanic Strike", "Engine/transmission/tire repairs blocked today; other work costs more.", 1f, 1f, 1.25f);
        }
    }

    private void RollBuyerDemand()
    {
        int demand = UnityEngine.Random.Range(1, 4);
        if (_eventToday.Name == "Weekend Hype") demand += 1;
        if (_eventToday.Name == "Tax Panic") demand -= 1;
        _buyerDemand = Mathf.Clamp(demand, 1, 4);
        _buyersRemainingToday = _buyerDemand;
    }

    private void EnsureBuyerQueue()
    {
        while (_buyerQueue.Count < 3)
        {
            _buyerQueue.Add(_buyers[UnityEngine.Random.Range(0, _buyers.Count)]);
        }
    }

    private void AdvanceBuyerQueue()
    {
        if (_buyerQueue.Count > 0)
        {
            _buyerQueue.RemoveAt(0);
        }
        EnsureBuyerQueue();
    }

    private BuyerType CurrentBuyer()
    {
        EnsureBuyerQueue();
        return _buyerQueue.Count > 0 ? _buyerQueue[0] : null;
    }

    private bool IsMechanical(FaultId fault)
    {
        for (int i = 0; i < MechanicalFaults.Length; i++)
        {
            if (MechanicalFaults[i] == fault)
            {
                return true;
            }
        }
        return false;
    }

    private List<FaultId> MergeFaults(List<FaultId> a, List<FaultId> b)
    {
        var merged = new List<FaultId>(a);
        foreach (var f in b)
        {
            if (!merged.Contains(f))
            {
                merged.Add(f);
            }
        }
        return merged;
    }

    private string FaultList(List<FaultId> faults)
    {
        var labels = new List<string>();
        foreach (var f in faults)
        {
            labels.Add(Faults[f].Label);
        }
        return labels.Count == 0 ? "none" : string.Join(", ", labels);
    }

    private void Log(string msg)
    {
        string line = $"[Day {_day}] {msg}";
        Debug.Log(line);
        _eventLog.Insert(0, line);
        if (_eventLog.Count > 120)
        {
            _eventLog.RemoveAt(_eventLog.Count - 1);
        }
    }

}
