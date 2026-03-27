using System.Collections.Generic;
using UnityEngine;

public partial class JunkerTraderGame
{
    private void Update()
    {
        HandleWorldClick();
        HandleCamera();
        SyncGaragePreview();

        foreach (var kv in _carVisuals)
        {
            if (kv.Value != null)
            {
                kv.Value.transform.Rotate(0f, 20f * Time.deltaTime, 0f);
            }
        }
    }

    private void OnGUI()
    {
        var buyer = CurrentBuyer();
        var next = _buyerQueue.Count > 1 ? _buyerQueue[1] : null;
        GUI.Box(new Rect(12f, 12f, Screen.width - 24f, 34f),
            $"Day {_day}/{MaxDays} | Money ${_money:N0} | Revenue ${_totalRevenue:N0} | Delta ${(_money - StartMoney):N0} | Inventory {_inventory.Count} | Buyer {(buyer != null ? buyer.Name : "N/A")} | Next {(next != null ? next.Name : "N/A")} | Buyers Left {_buyersRemainingToday}/{_buyerDemand} | Event {_eventToday.Name}");

        GUILayout.BeginArea(new Rect(12f, 52f, 430f, Screen.height - 64f), GUI.skin.box);
        GUILayout.Label($"Mode: {_view}");

        GUILayout.BeginHorizontal();
        if (GUILayout.Button("Market", GUILayout.Width(95f))) { _view = View.Market; FocusView(); }
        if (GUILayout.Button("Garage", GUILayout.Width(95f))) { _view = View.Garage; EnsureGarageSelection(); FocusView(); }
        if (GUILayout.Button("Sales Desk", GUILayout.Width(95f))) { _view = View.SaleResult; FocusView(); }
        if (GUILayout.Button("End Day", GUILayout.Width(95f))) { EndDay(); }
        GUILayout.EndHorizontal();

        GUILayout.Label("WASD move camera, RMB drag orbit, click market car to negotiate.");
        GUILayout.Space(6f);

        if (_view == View.Market) DrawMarketCompact();
        else if (_view == View.Negotiation) DrawNegotiationCompact();
        else if (_view == View.Garage) DrawGarageCompact();
        else DrawSaleCompact();

        GUILayout.EndArea();
    }

    private void DrawMarketCompact()
    {
        GUILayout.Label($"Listings: {_marketCars.Count} (click any car mesh in market zone)");
        if (_selectedMarketCar != null && _marketCars.Contains(_selectedMarketCar))
        {
            GUILayout.BeginVertical("box");
            GUILayout.Label($"Selected: {_selectedMarketCar.Name} | Ask ${_selectedMarketCar.AskingPrice:N0} | Seller {_selectedMarketCar.Seller.Name}");
            GUILayout.Label($"Visible faults: {FaultList(_selectedMarketCar.VisibleFaults)}");
            if (GUILayout.Button("Negotiate Selected", GUILayout.Width(220f)))
            {
                _offerSliderPct = 90f;
                _view = View.Negotiation;
            }
            GUILayout.EndVertical();
        }
    }

    private void DrawNegotiationCompact()
    {
        if (_selectedMarketCar == null || !_marketCars.Contains(_selectedMarketCar))
        {
            GUILayout.Label("No selected market car. Click a car in Market.");
            if (GUILayout.Button("Back To Market", GUILayout.Width(180f))) _view = View.Market;
            return;
        }

        var car = _selectedMarketCar;
        GUILayout.BeginVertical("box");
        GUILayout.Label($"{car.Name} | Ask ${car.AskingPrice:N0} | Seller {car.Seller.Name}");
        GUILayout.Label($"Age {car.Age} | Mileage {car.Mileage:N0} | Cosmetic {car.CosmeticCondition}/100");
        GUILayout.Label($"Visible faults: {FaultList(car.VisibleFaults)}");
        GUILayout.EndVertical();

        _offerSliderPct = GUILayout.HorizontalSlider(_offerSliderPct, 60f, 120f, GUILayout.Width(360f));
        int custom = Mathf.RoundToInt(car.AskingPrice * (_offerSliderPct / 100f));
        GUILayout.Label($"Custom offer ${custom:N0} ({_offerSliderPct:F0}% of ask)");

        GUILayout.BeginHorizontal();
        if (GUILayout.Button("Offer Custom", GUILayout.Width(105f))) AttemptOffer(car, custom, "custom");
        if (GUILayout.Button($"Lowball ${Mathf.RoundToInt(car.AskingPrice * LowballRatio):N0}", GUILayout.Width(105f))) AttemptOffer(car, Mathf.RoundToInt(car.AskingPrice * LowballRatio), "lowball");
        if (GUILayout.Button($"Fair ${Mathf.RoundToInt(car.AskingPrice * FairRatio):N0}", GUILayout.Width(90f))) AttemptOffer(car, Mathf.RoundToInt(car.AskingPrice * FairRatio), "fair");
        if (GUILayout.Button($"Ask ${car.AskingPrice:N0}", GUILayout.Width(90f))) AttemptOffer(car, car.AskingPrice, "asking");
        GUILayout.EndHorizontal();

        if (GUILayout.Button("Walk Away", GUILayout.Width(160f)))
        {
            _view = View.Market;
        }
    }

    private void DrawGarageCompact()
    {
        EnsureGarageSelection();
        if (_selectedGarageCar == null || !_inventory.Contains(_selectedGarageCar))
        {
            GUILayout.Label("Inventory empty.");
            return;
        }

        GUILayout.BeginHorizontal();
        if (GUILayout.Button("< Prev Car", GUILayout.Width(100f))) CycleGarageCar(-1);
        GUILayout.Label($"{_selectedGarageCar.Name}");
        if (GUILayout.Button("Next Car >", GUILayout.Width(100f))) CycleGarageCar(1);
        GUILayout.EndHorizontal();

        var car = _selectedGarageCar;
        var known = car.Inspected ? MergeFaults(car.VisibleFaults, car.HiddenFaults) : new List<FaultId>(car.VisibleFaults);
        GUILayout.BeginVertical("box");
        GUILayout.Label($"Bought ${car.BoughtFor:N0} | Invested ${car.TotalInvested:N0} | Cosmetic {car.CosmeticCondition}/100");
        GUILayout.Label($"Known faults: {(known.Count > 0 ? FaultList(known) : "none")}");
        GUILayout.Label($"Hidden: {(car.Inspected ? "revealed" : "unknown")} | Buyers left today {_buyersRemainingToday}");
        GUILayout.EndVertical();

        GUI.enabled = !car.Inspected;
        if (GUILayout.Button($"Inspect (${Mathf.RoundToInt(InspectCost * _eventToday.InspectModifier):N0})", GUILayout.Width(180f))) InspectCar(car);
        GUI.enabled = true;

        foreach (var fault in known)
        {
            var def = Faults[fault];
            int cost = Mathf.RoundToInt(def.RepairCost * _eventToday.InspectModifier);
            bool blocked = _eventToday.Name == "Mechanic Strike" && IsMechanical(fault);
            GUILayout.BeginHorizontal();
            GUILayout.Label($"{def.Label} (${cost:N0})");
            GUI.enabled = !car.RepairedFaults.Contains(fault) && !blocked;
            if (GUILayout.Button(blocked ? "Blocked" : (car.RepairedFaults.Contains(fault) ? "Done" : "Repair"), GUILayout.Width(90f)))
            {
                RepairFault(car, fault);
            }
            GUI.enabled = true;
            GUILayout.EndHorizontal();
        }

        GUI.enabled = !car.CleanedOnce;
        if (GUILayout.Button(car.CleanedOnce ? "Already Cleaned" : $"Cheap Clean (${CosmeticCleanCost:N0})", GUILayout.Width(180f))) CleanCar(car);
        GUI.enabled = true;

        int trueValue = Mathf.RoundToInt(CalcTrueValue(car) * _eventToday.SaleModifier);
        _sellSliderPct = GUILayout.HorizontalSlider(_sellSliderPct, 70f, 130f, GUILayout.Width(360f));
        int list = Mathf.RoundToInt(trueValue * (_sellSliderPct / 100f));
        GUILayout.Label($"Custom list ${list:N0}");

        GUI.enabled = _buyersRemainingToday > 0;
        GUILayout.BeginHorizontal();
        if (GUILayout.Button("Sell Custom", GUILayout.Width(95f))) AttemptSale(car, "custom", _sellSliderPct / 100f);
        if (GUILayout.Button("Sell Quick", GUILayout.Width(95f))) AttemptSale(car, "quick", QuickSellMult);
        if (GUILayout.Button("Sell Fair", GUILayout.Width(95f))) AttemptSale(car, "fair", FairSellMult);
        if (GUILayout.Button("Sell Premium", GUILayout.Width(110f))) AttemptSale(car, "premium", PremiumSellMult);
        GUILayout.EndHorizontal();
        GUI.enabled = true;

        if (GUILayout.Button("Sell To Junkyard", GUILayout.Width(180f))) SellToJunkyard(car);
    }

    private void DrawSaleCompact()
    {
        if (_pendingSale == null)
        {
            GUILayout.Label("No pending sale offer.");
            GUILayout.Label("Sell a car from Garage to get buyer offers.");
            return;
        }

        GUILayout.BeginVertical("box");
        GUILayout.Label($"Buyer {_pendingSale.Buyer.Name} | {_pendingSale.Outcome}");
        GUILayout.Label($"Offer ${_pendingSale.OfferedPrice:N0} | List ${_pendingSale.ListPrice:N0}");
        GUILayout.EndVertical();

        _counterSliderPct = GUILayout.HorizontalSlider(_counterSliderPct, 100f, 140f, GUILayout.Width(360f));
        int counter = Mathf.RoundToInt(_pendingSale.OfferedPrice * (_counterSliderPct / 100f));
        GUILayout.Label($"Counter ${counter:N0}");
        if (GUILayout.Button("Send Counteroffer", GUILayout.Width(180f))) AttemptCounteroffer(counter);

        GUILayout.BeginHorizontal();
        if (GUILayout.Button("Accept", GUILayout.Width(120f))) AcceptPendingSale();
        if (GUILayout.Button("Reject", GUILayout.Width(120f))) RejectPendingSale();
        GUILayout.EndHorizontal();
    }

    private void HandleWorldClick()
    {
        if (Input.GetMouseButtonDown(0) && !Input.GetKey(KeyCode.LeftAlt))
        {
            if (Camera.main == null) return;
            var ray = Camera.main.ScreenPointToRay(Input.mousePosition);
            if (Physics.Raycast(ray, out var hit, 300f))
            {
                var tag = hit.collider.GetComponent<CarVisualTag>();
                if (tag != null)
                {
                    var car = _marketCars.Find(c => c.Id == tag.CarId);
                    if (car != null)
                    {
                        _selectedMarketCar = car;
                        _view = View.Negotiation;
                    }
                }
            }
        }
    }

    private void HandleCamera()
    {
        if (Input.GetMouseButton(1))
        {
            _cameraOrbit.y += Input.GetAxis("Mouse X") * 2f;
            _cameraOrbit.x = Mathf.Clamp(_cameraOrbit.x - Input.GetAxis("Mouse Y") * 2f, 12f, 70f);
        }

        _cameraDistance = Mathf.Clamp(_cameraDistance - Input.mouseScrollDelta.y * 0.8f, 8f, 30f);
        if (Camera.main == null) return;

        Vector3 target = _view == View.Garage ? _garageAnchor.position : (_view == View.SaleResult ? _saleAnchor.position : _showroomRoot.position);
        Vector3 pivotOffset = Quaternion.Euler(_cameraOrbit.x, _cameraOrbit.y, 0f) * new Vector3(0f, 0f, -_cameraDistance);
        Vector3 desired = target + pivotOffset;

        float speed = 8f * Time.deltaTime;
        if (Input.GetKey(KeyCode.W)) desired += Camera.main.transform.forward * (8f * Time.deltaTime);
        if (Input.GetKey(KeyCode.S)) desired -= Camera.main.transform.forward * (8f * Time.deltaTime);
        if (Input.GetKey(KeyCode.A)) desired -= Camera.main.transform.right * (8f * Time.deltaTime);
        if (Input.GetKey(KeyCode.D)) desired += Camera.main.transform.right * (8f * Time.deltaTime);

        Camera.main.transform.position = Vector3.Lerp(Camera.main.transform.position, desired, speed);
        Camera.main.transform.rotation = Quaternion.Lerp(Camera.main.transform.rotation, Quaternion.LookRotation(target - Camera.main.transform.position), speed);
    }

    private void FocusView()
    {
        if (_view == View.Market) _cameraOrbit = new Vector2(28f, 0f);
        if (_view == View.Garage) _cameraOrbit = new Vector2(24f, 128f);
        if (_view == View.SaleResult) _cameraOrbit = new Vector2(18f, -120f);
    }

    private void EnsureGarageSelection()
    {
        if (_selectedGarageCar == null && _inventory.Count > 0) _selectedGarageCar = _inventory[0];
        if (_selectedGarageCar != null && !_inventory.Contains(_selectedGarageCar)) _selectedGarageCar = _inventory.Count > 0 ? _inventory[0] : null;
    }

    private void CycleGarageCar(int dir)
    {
        EnsureGarageSelection();
        if (_selectedGarageCar == null) return;
        int idx = _inventory.IndexOf(_selectedGarageCar);
        if (idx < 0) return;
        idx = (idx + dir + _inventory.Count) % _inventory.Count;
        _selectedGarageCar = _inventory[idx];
    }

    private void SyncGaragePreview()
    {
        if (_garagePreview == null || _garageAnchor == null) return;
        EnsureGarageSelection();
        if (_selectedGarageCar == null)
        {
            _garagePreview.SetActive(false);
            return;
        }

        _garagePreview.SetActive(true);
        _garagePreview.transform.position = _garageAnchor.position + new Vector3(0f, 0.8f, 0f);
        _garagePreview.transform.Rotate(0f, 25f * Time.deltaTime, 0f);
        var r = _garagePreview.GetComponent<Renderer>();
        if (r != null)
        {
            float t = _selectedGarageCar.CosmeticCondition / 100f;
            r.material.color = Color.Lerp(new Color(0.45f, 0.12f, 0.10f), new Color(0.15f, 0.55f, 0.25f), t);
        }
    }

    private void Setup3DScene()
    {
        Camera cam = Camera.main;
        if (cam == null)
        {
            var cameraGo = new GameObject("Main Camera");
            cam = cameraGo.AddComponent<Camera>();
            cameraGo.tag = "MainCamera";
        }

        cam.transform.position = new Vector3(0f, 9f, -16f);
        cam.transform.rotation = Quaternion.Euler(26f, 0f, 0f);
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.08f, 0.09f, 0.11f);

        if (FindFirstObjectByType<Light>() == null)
        {
            var lightGo = new GameObject("Directional Light");
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            light.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
        }

        var floor = GameObject.CreatePrimitive(PrimitiveType.Plane);
        floor.name = "WorldFloor";
        floor.transform.position = Vector3.zero;
        floor.transform.localScale = new Vector3(7f, 1f, 7f);
        floor.GetComponent<Renderer>().material.color = new Color(0.18f, 0.18f, 0.2f);

        _showroomRoot = new GameObject("MarketZone").transform;
        _showroomRoot.position = new Vector3(-9f, 0f, 0f);
        _garageAnchor = new GameObject("GarageZone").transform;
        _garageAnchor.position = new Vector3(4.5f, 0f, -4f);
        _saleAnchor = new GameObject("SaleZone").transform;
        _saleAnchor.position = new Vector3(6f, 0f, 5f);

        var marketPad = GameObject.CreatePrimitive(PrimitiveType.Cube);
        marketPad.transform.position = _showroomRoot.position + new Vector3(0f, 0.05f, 0f);
        marketPad.transform.localScale = new Vector3(12f, 0.1f, 12f);
        marketPad.GetComponent<Renderer>().material.color = new Color(0.14f, 0.18f, 0.22f);

        var garagePad = GameObject.CreatePrimitive(PrimitiveType.Cube);
        garagePad.transform.position = _garageAnchor.position + new Vector3(0f, 0.05f, 0f);
        garagePad.transform.localScale = new Vector3(8f, 0.1f, 6f);
        garagePad.GetComponent<Renderer>().material.color = new Color(0.22f, 0.18f, 0.14f);

        var salePad = GameObject.CreatePrimitive(PrimitiveType.Cube);
        salePad.transform.position = _saleAnchor.position + new Vector3(0f, 0.05f, 0f);
        salePad.transform.localScale = new Vector3(6f, 0.1f, 6f);
        salePad.GetComponent<Renderer>().material.color = new Color(0.14f, 0.22f, 0.16f);

        var desk = GameObject.CreatePrimitive(PrimitiveType.Cube);
        desk.transform.position = _saleAnchor.position + new Vector3(0f, 0.9f, -1.2f);
        desk.transform.localScale = new Vector3(2f, 1.8f, 0.8f);
        desk.GetComponent<Renderer>().material.color = new Color(0.35f, 0.30f, 0.26f);

        var buyerNpc = GameObject.CreatePrimitive(PrimitiveType.Capsule);
        buyerNpc.transform.position = _saleAnchor.position + new Vector3(0f, 1.1f, 0.8f);
        buyerNpc.transform.localScale = new Vector3(0.8f, 1.1f, 0.8f);
        buyerNpc.GetComponent<Renderer>().material.color = new Color(0.25f, 0.55f, 0.75f);

        _garagePreview = GameObject.CreatePrimitive(PrimitiveType.Cube);
        _garagePreview.name = "GaragePreviewCar";
        _garagePreview.transform.localScale = new Vector3(2.2f, 1.4f, 4f);
        _garagePreview.SetActive(false);
        _garagePreview.GetComponent<Collider>().enabled = false;
    }

    private void SpawnCarVisual(Car car, int index)
    {
        if (_showroomRoot == null)
        {
            return;
        }

        var carObj = GameObject.CreatePrimitive(PrimitiveType.Cube);
        carObj.name = $"Car_{car.Id}_{car.Name}";
        carObj.transform.SetParent(_showroomRoot);

        int columns = 3;
        float spacing = 3.4f;
        int row = index / columns;
        int col = index % columns;
        float x = (col - 1) * spacing;
        float z = (row - 1) * spacing;

        carObj.transform.position = _showroomRoot.position + new Vector3(x, 0.7f, z);
        carObj.transform.localScale = new Vector3(1.8f, 1.1f, 3.4f);

        var renderer = carObj.GetComponent<Renderer>();
        if (renderer != null)
        {
            float t = car.CosmeticCondition / 100f;
            renderer.material.color = Color.Lerp(new Color(0.45f, 0.12f, 0.10f), new Color(0.15f, 0.55f, 0.25f), t);
        }

        var tag = carObj.AddComponent<CarVisualTag>();
        tag.CarId = car.Id;

        _carVisuals[car.Id] = carObj;
    }

    private void RemoveVisual(int carId)
    {
        if (_carVisuals.TryGetValue(carId, out var obj))
        {
            if (obj != null)
            {
                Destroy(obj);
            }
            _carVisuals.Remove(carId);
        }
    }

    private void ClearMarketVisuals()
    {
        foreach (var kv in _carVisuals)
        {
            if (kv.Value != null)
            {
                Destroy(kv.Value);
            }
        }
        _carVisuals.Clear();
    }
}
