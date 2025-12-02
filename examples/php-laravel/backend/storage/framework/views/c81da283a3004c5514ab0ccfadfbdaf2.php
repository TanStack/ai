<script>

    (function () {
        const darkStyles = document.querySelector('style[data-theme="dark"]')?.textContent
        const lightStyles = document.querySelector('style[data-theme="light"]')?.textContent

        const removeStyles = () => {
            document.querySelector('style[data-theme="dark"]')?.remove()
            document.querySelector('style[data-theme="light"]')?.remove()
        }

        removeStyles()

        setDarkClass = () => {
            removeStyles()

            const isDark = localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)

            isDark ? document.documentElement.classList.add('dark') : document.documentElement.classList.remove('dark')

            if (isDark) {
                document.head.insertAdjacentHTML('beforeend', `<style data-theme="dark">${darkStyles}</style>`)
            } else {
                document.head.insertAdjacentHTML('beforeend', `<style data-theme="light">${lightStyles}</style>`)
            }
        }

        setDarkClass()

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setDarkClass)
    })();
</script>

<div
    class="relative"
    x-data="{
        menu: false,
        theme: localStorage.theme,
        darkMode() {
            this.theme = 'dark'
            localStorage.theme = 'dark'
            setDarkClass()
        },
        lightMode() {
            this.theme = 'light'
            localStorage.theme = 'light'
            setDarkClass()
        },
        systemMode() {
            this.theme = undefined
            localStorage.removeItem('theme')
            setDarkClass()
        },
    }"
    @click.outside="menu = false"
>
    <button
        x-cloak
        class="block rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        :class="theme ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600 hover:text-gray-500 focus:text-gray-500 dark:hover:text-gray-500 dark:focus:text-gray-500'"
        @click="menu = ! menu"
    >
        <?php if (isset($component)) { $__componentOriginalbfde029a2e31d1ec96b5017ff81a67a7 = $component; } ?>
<?php if (isset($attributes)) { $__attributesOriginalbfde029a2e31d1ec96b5017ff81a67a7 = $attributes; } ?>
<?php $component = Illuminate\View\AnonymousComponent::resolve(['view' => 'laravel-exceptions-renderer::components.icons.sun','data' => ['class' => 'block h-5 w-5 dark:hidden']] + (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag ? $attributes->all() : [])); ?>
<?php $component->withName('laravel-exceptions-renderer::icons.sun'); ?>
<?php if ($component->shouldRender()): ?>
<?php $__env->startComponent($component->resolveView(), $component->data()); ?>
<?php if (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag): ?>
<?php $attributes = $attributes->except(\Illuminate\View\AnonymousComponent::ignoredParameterNames()); ?>
<?php endif; ?>
<?php $component->withAttributes(['class' => 'block h-5 w-5 dark:hidden']); ?>
<?php echo $__env->renderComponent(); ?>
<?php endif; ?>
<?php if (isset($__attributesOriginalbfde029a2e31d1ec96b5017ff81a67a7)): ?>
<?php $attributes = $__attributesOriginalbfde029a2e31d1ec96b5017ff81a67a7; ?>
<?php unset($__attributesOriginalbfde029a2e31d1ec96b5017ff81a67a7); ?>
<?php endif; ?>
<?php if (isset($__componentOriginalbfde029a2e31d1ec96b5017ff81a67a7)): ?>
<?php $component = $__componentOriginalbfde029a2e31d1ec96b5017ff81a67a7; ?>
<?php unset($__componentOriginalbfde029a2e31d1ec96b5017ff81a67a7); ?>
<?php endif; ?>
        <?php if (isset($component)) { $__componentOriginal6dda8ad3ea7f20f6c0a87e7037386745 = $component; } ?>
<?php if (isset($attributes)) { $__attributesOriginal6dda8ad3ea7f20f6c0a87e7037386745 = $attributes; } ?>
<?php $component = Illuminate\View\AnonymousComponent::resolve(['view' => 'laravel-exceptions-renderer::components.icons.moon','data' => ['class' => 'hidden h-5 w-5 dark:block']] + (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag ? $attributes->all() : [])); ?>
<?php $component->withName('laravel-exceptions-renderer::icons.moon'); ?>
<?php if ($component->shouldRender()): ?>
<?php $__env->startComponent($component->resolveView(), $component->data()); ?>
<?php if (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag): ?>
<?php $attributes = $attributes->except(\Illuminate\View\AnonymousComponent::ignoredParameterNames()); ?>
<?php endif; ?>
<?php $component->withAttributes(['class' => 'hidden h-5 w-5 dark:block']); ?>
<?php echo $__env->renderComponent(); ?>
<?php endif; ?>
<?php if (isset($__attributesOriginal6dda8ad3ea7f20f6c0a87e7037386745)): ?>
<?php $attributes = $__attributesOriginal6dda8ad3ea7f20f6c0a87e7037386745; ?>
<?php unset($__attributesOriginal6dda8ad3ea7f20f6c0a87e7037386745); ?>
<?php endif; ?>
<?php if (isset($__componentOriginal6dda8ad3ea7f20f6c0a87e7037386745)): ?>
<?php $component = $__componentOriginal6dda8ad3ea7f20f6c0a87e7037386745; ?>
<?php unset($__componentOriginal6dda8ad3ea7f20f6c0a87e7037386745); ?>
<?php endif; ?>
    </button>

    <div
        x-show="menu"
        class="absolute right-0 z-10 flex origin-top-right flex-col rounded-md bg-white shadow-xl ring-1 ring-gray-900/5 dark:bg-gray-800"
        style="display: none"
        @click="menu = false"
    >
        <button
            class="flex items-center gap-3 px-4 py-2 hover:rounded-t-md hover:bg-gray-100 dark:hover:bg-gray-700"
            :class="theme === 'light' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'"
            @click="lightMode()"
        >
            <?php if (isset($component)) { $__componentOriginalbfde029a2e31d1ec96b5017ff81a67a7 = $component; } ?>
<?php if (isset($attributes)) { $__attributesOriginalbfde029a2e31d1ec96b5017ff81a67a7 = $attributes; } ?>
<?php $component = Illuminate\View\AnonymousComponent::resolve(['view' => 'laravel-exceptions-renderer::components.icons.sun','data' => ['class' => 'h-5 w-5']] + (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag ? $attributes->all() : [])); ?>
<?php $component->withName('laravel-exceptions-renderer::icons.sun'); ?>
<?php if ($component->shouldRender()): ?>
<?php $__env->startComponent($component->resolveView(), $component->data()); ?>
<?php if (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag): ?>
<?php $attributes = $attributes->except(\Illuminate\View\AnonymousComponent::ignoredParameterNames()); ?>
<?php endif; ?>
<?php $component->withAttributes(['class' => 'h-5 w-5']); ?>
<?php echo $__env->renderComponent(); ?>
<?php endif; ?>
<?php if (isset($__attributesOriginalbfde029a2e31d1ec96b5017ff81a67a7)): ?>
<?php $attributes = $__attributesOriginalbfde029a2e31d1ec96b5017ff81a67a7; ?>
<?php unset($__attributesOriginalbfde029a2e31d1ec96b5017ff81a67a7); ?>
<?php endif; ?>
<?php if (isset($__componentOriginalbfde029a2e31d1ec96b5017ff81a67a7)): ?>
<?php $component = $__componentOriginalbfde029a2e31d1ec96b5017ff81a67a7; ?>
<?php unset($__componentOriginalbfde029a2e31d1ec96b5017ff81a67a7); ?>
<?php endif; ?>
            Light
        </button>
        <button
            class="flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
            :class="theme === 'dark' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'"
            @click="darkMode()"
        >
            <?php if (isset($component)) { $__componentOriginal6dda8ad3ea7f20f6c0a87e7037386745 = $component; } ?>
<?php if (isset($attributes)) { $__attributesOriginal6dda8ad3ea7f20f6c0a87e7037386745 = $attributes; } ?>
<?php $component = Illuminate\View\AnonymousComponent::resolve(['view' => 'laravel-exceptions-renderer::components.icons.moon','data' => ['class' => 'h-5 w-5']] + (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag ? $attributes->all() : [])); ?>
<?php $component->withName('laravel-exceptions-renderer::icons.moon'); ?>
<?php if ($component->shouldRender()): ?>
<?php $__env->startComponent($component->resolveView(), $component->data()); ?>
<?php if (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag): ?>
<?php $attributes = $attributes->except(\Illuminate\View\AnonymousComponent::ignoredParameterNames()); ?>
<?php endif; ?>
<?php $component->withAttributes(['class' => 'h-5 w-5']); ?>
<?php echo $__env->renderComponent(); ?>
<?php endif; ?>
<?php if (isset($__attributesOriginal6dda8ad3ea7f20f6c0a87e7037386745)): ?>
<?php $attributes = $__attributesOriginal6dda8ad3ea7f20f6c0a87e7037386745; ?>
<?php unset($__attributesOriginal6dda8ad3ea7f20f6c0a87e7037386745); ?>
<?php endif; ?>
<?php if (isset($__componentOriginal6dda8ad3ea7f20f6c0a87e7037386745)): ?>
<?php $component = $__componentOriginal6dda8ad3ea7f20f6c0a87e7037386745; ?>
<?php unset($__componentOriginal6dda8ad3ea7f20f6c0a87e7037386745); ?>
<?php endif; ?>
            Dark
        </button>
        <button
            class="flex items-center gap-3 px-4 py-2 hover:rounded-b-md hover:bg-gray-100 dark:hover:bg-gray-700"
            :class="theme === undefined ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'"
            @click="systemMode()"
        >
            <?php if (isset($component)) { $__componentOriginala52e607cb40b8eec566206ff9f3ca13c = $component; } ?>
<?php if (isset($attributes)) { $__attributesOriginala52e607cb40b8eec566206ff9f3ca13c = $attributes; } ?>
<?php $component = Illuminate\View\AnonymousComponent::resolve(['view' => 'laravel-exceptions-renderer::components.icons.computer-desktop','data' => ['class' => 'h-5 w-5']] + (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag ? $attributes->all() : [])); ?>
<?php $component->withName('laravel-exceptions-renderer::icons.computer-desktop'); ?>
<?php if ($component->shouldRender()): ?>
<?php $__env->startComponent($component->resolveView(), $component->data()); ?>
<?php if (isset($attributes) && $attributes instanceof Illuminate\View\ComponentAttributeBag): ?>
<?php $attributes = $attributes->except(\Illuminate\View\AnonymousComponent::ignoredParameterNames()); ?>
<?php endif; ?>
<?php $component->withAttributes(['class' => 'h-5 w-5']); ?>
<?php echo $__env->renderComponent(); ?>
<?php endif; ?>
<?php if (isset($__attributesOriginala52e607cb40b8eec566206ff9f3ca13c)): ?>
<?php $attributes = $__attributesOriginala52e607cb40b8eec566206ff9f3ca13c; ?>
<?php unset($__attributesOriginala52e607cb40b8eec566206ff9f3ca13c); ?>
<?php endif; ?>
<?php if (isset($__componentOriginala52e607cb40b8eec566206ff9f3ca13c)): ?>
<?php $component = $__componentOriginala52e607cb40b8eec566206ff9f3ca13c; ?>
<?php unset($__componentOriginala52e607cb40b8eec566206ff9f3ca13c); ?>
<?php endif; ?>
            System
        </button>
    </div>
</div>
<?php /**PATH /Users/jherr/projects/tanstack/ai/examples/php-laravel/backend/vendor/laravel/framework/src/Illuminate/Foundation/Providers/../resources/exceptions/renderer/components/theme-switcher.blade.php ENDPATH**/ ?>