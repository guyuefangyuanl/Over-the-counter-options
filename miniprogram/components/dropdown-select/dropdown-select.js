Component({
  properties: {
    options: {
      type: Array,
      value: []
    },
    value: {
      type: null,
      value: null,
      observer(newVal) {
        this.updateSelectedLabel(newVal);
      }
    },
    placeholder: {
      type: String,
      value: '请选择'
    },
    labelKey: {
      type: String,
      value: 'label'
    },
    valueKey: {
      type: String,
      value: 'value'
    }
  },

  data: {
    isOpen: false,
    selectedLabel: '',
    selectedValue: null
  },

  lifetimes: {
    attached() {
      this.updateSelectedLabel(this.properties.value);
    }
  },

  methods: {
    toggleDropdown() {
      this.setData({ isOpen: !this.data.isOpen });
    },

    closeDropdown() {
      this.setData({ isOpen: false });
    },

    onSelect(e) {
      const { value, label } = e.currentTarget.dataset;
      this.setData({
        selectedValue: value,
        selectedLabel: label,
        isOpen: false
      });
      this.triggerEvent('change', { value, label });
    },

    updateSelectedLabel(value) {
      const { options, valueKey, labelKey } = this.properties;
      const selectedOption = options.find(opt => opt[valueKey] === value);
      if (selectedOption) {
        this.setData({
          selectedValue: value,
          selectedLabel: selectedOption[labelKey]
        });
      } else {
        this.setData({
          selectedValue: value,
          selectedLabel: ''
        });
      }
    },
    
    preventScroll() {}
  }
});
